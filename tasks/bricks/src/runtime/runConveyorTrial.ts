// @ts-nocheck
import {
  createDrtPresentationBridge,
  createScaledCanvasHost,
  DrtController,
  getAutoResponderProfile,
  isAutoResponderEnabled,
  normalizeKey,
  sampleAutoHoldDurationMs,
  sampleAutoInteractionDelayMs,
} from '@experiments/core';
import { GameState } from './game_state.js';
import { ConveyorRenderer } from './renderer_pixi.js';
import { estimateTrialDifficulty } from './difficulty_estimator.js';
import { applyDisplayPreset, resolveDisplayPresetId } from './display_presets.js';
import type { BricksScopedDrtConfig } from './drtConfig.js';
import { resolveBricksDrtConfig } from './drtConfig.js';

export interface ConveyorTrialRunArgs {
  displayElement: HTMLElement;
  blockLabel: string;
  blockIndex: number;
  trialIndex: number;
  config: Record<string, unknown>;
  drtRuntime?: ConveyorTrialDrtRuntime;
}

export interface ConveyorTrialData {
  block_label: string;
  block_index: number;
  trial_index: number;
  trial_duration_ms: number;
  end_reason: string;
  runtime_conveyor_lengths: number[];
  difficulty_estimate: unknown;
  resolved_display_preset_id: string | null;
  config_snapshot: Record<string, unknown>;
  game: unknown;
  drt: unknown;
  timeline_events: Array<Record<string, unknown>>;
  performance?: Record<string, unknown>;
}

export interface ConveyorTrialDrtRuntimeBindings {
  displayElement?: HTMLElement | null;
  getElapsedMs: () => number;
  onEvent: (event: Record<string, unknown>) => void;
  onStimStart: (stimulus: Record<string, unknown>) => void;
  onStimEnd: (stimulus: Record<string, unknown>) => void;
}

export interface ConveyorTrialDrtRuntime {
  config: BricksScopedDrtConfig;
  controller: DrtController;
  stopOnCleanup?: boolean;
  attachBindings?: (bindings: ConveyorTrialDrtRuntimeBindings) => void;
  detachBindings?: () => void;
}

const randomUint32 = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
  } catch {
    // fall through
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
};

const materializeSeed = (seedSpec: unknown) => {
  if (seedSpec === undefined || seedSpec === null) return randomUint32();
  if (typeof seedSpec === 'string') {
    const s = seedSpec.trim().toLowerCase();
    if (s === 'random' || s === 'auto') return randomUint32();
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return asNum >>> 0;
    return randomUint32();
  }
  const n = Number(seedSpec);
  return Number.isFinite(n) ? (n >>> 0) : randomUint32();
};

const downloadJson = (filename: string, data: unknown) => {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn('Failed to download trial debug log:', error);
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const resolveBricksDrtOverride = (raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
  const source = asRecord(raw);
  if (!source) return null;
  const localModules = asRecord(source.modules);
  const taskModules = asRecord(asRecord(source.task)?.modules);
  return asRecord(localModules?.drt) ?? asRecord(taskModules?.drt) ?? null;
};

export async function runConveyorTrial(args: ConveyorTrialRunArgs): Promise<ConveyorTrialData> {
  const trial = args;
  const display_element = args.displayElement;
  const cfg = trial.config as any;
  const baseSeed = materializeSeed(cfg.trial?.seed);
  const resolvedDisplayPresetId = resolveDisplayPresetId(cfg, {
    baseSeed,
    trialIndex: trial.trialIndex,
  });
  const resolvedCfg = applyDisplayPreset(cfg, resolvedDisplayPresetId);
  const injectedDrtRuntime = args.drtRuntime ?? null;
  const legacyDrtRaw = resolveBricksDrtOverride(resolvedCfg) ?? {};
  const resolvedDrtConfig =
    injectedDrtRuntime?.config ?? resolveBricksDrtConfig(legacyDrtRaw);
  const drtController = injectedDrtRuntime?.controller ?? null;
  if (resolvedDrtConfig.enabled && !drtController) {
    throw new Error('Bricks DRT is enabled but no module-scoped DRT runtime was injected.');
  }

  const host = createScaledCanvasHost({
    displayElement: display_element,
    canvasWidth: Number(resolvedCfg.display.canvasWidth),
    canvasHeight: Number(resolvedCfg.display.canvasHeight),
    viewportPaddingPx: Number(resolvedCfg.display?.viewportPaddingPx ?? 24),
  });
  const container = host.container;

  const debugCfg = (resolvedCfg?.debug || {}) as Record<string, unknown>;
  const perfDebugCfg = (resolvedCfg?.display?.performance || {}) as Record<string, unknown>;
  const frameBudgetMs = Math.max(1, Number(debugCfg.performanceFrameBudgetMs ?? perfDebugCfg.frameBudgetMs ?? 16.67));
  const frameStats = {
    frames: 0,
    rawDtSumMs: 0,
    rawDtMinMs: Number.POSITIVE_INFINITY,
    rawDtMaxMs: 0,
    clampedFrames: 0,
    budgetOverrunFrames: 0,
    severeFrames: 0,
    tickCostSumMs: 0,
    tickCostMaxMs: 0
  };
  const timelineEvents: Array<Record<string, unknown>> = [];
  const logEvent = (event: Record<string, unknown>) => {
    timelineEvents.push(event);
    if (debugCfg.holdConsole && event?.type === 'brick_hold' && event?.valid === true) {
      const holdMs = Number(event.hold_ms ?? 0);
      const progressPct = Math.max(0, Math.min(100, Number(event.progress_total ?? 0) * 100));
      console.info(`[hold-debug] brick=${event.brick_id ?? '-'} hold_ms=${Math.round(holdMs)} clear_pct=${progressPct.toFixed(1)}`);
    }
  };

  const gameState = new GameState(resolvedCfg, { onEvent: logEvent, seed: baseSeed });
  const runtimeConveyorLengths = gameState.conveyors.map((conveyor: any) => conveyor.length);
  const difficultyEstimate = estimateTrialDifficulty(gameState, resolvedCfg);

  const trialMode = resolvedCfg.trial?.mode ?? 'fixed_time';
  const brickQuota = Number.isFinite(resolvedCfg.bricks?.maxBricksPerTrial) ? resolvedCfg.bricks.maxBricksPerTrial : null;
  const enforceBrickQuota = trialMode === 'max_bricks' && brickQuota !== null;
  const drtEnabled = resolvedDrtConfig.enabled === true;
  const drtStatsSnapshot = {
    presented: 0,
    hits: 0,
    misses: 0,
    falseAlarms: 0,
  };
  const hudTimerGranularityMs = Math.max(10, Number(resolvedCfg?.display?.ui?.hudTimerGranularityMs ?? 100));
  let lastHudSignature = '';
  const autoProfile = getAutoResponderProfile();
  const autoEnabled = isAutoResponderEnabled();
  const maxTimeSecRaw = resolvedCfg.trial?.maxTimeSec;
  const configuredMaxDuration =
    Number.isFinite(maxTimeSecRaw) && maxTimeSecRaw !== null ? Math.max(0, Math.floor(maxTimeSecRaw * 1000)) : null;
  const maxDuration = configuredMaxDuration ?? (autoEnabled ? Math.max(5_000, Number(autoProfile?.maxTrialDurationMs ?? 90_000)) : null);
  const trialCfg = (resolvedCfg?.trial || {}) as Record<string, unknown>;
  const globalEndDelayMsRaw = Number(trialCfg.endDelayMs);
  const globalEndDelayMs = Number.isFinite(globalEndDelayMsRaw) ? Math.max(0, Math.floor(globalEndDelayMsRaw)) : 0;
  const brickQuotaEndDelayMsRaw = Number(trialCfg.brickQuotaEndDelayMs);
  const brickQuotaEndDelayMs = Number.isFinite(brickQuotaEndDelayMsRaw)
    ? Math.max(0, Math.floor(brickQuotaEndDelayMsRaw))
    : (globalEndDelayMs > 0 ? globalEndDelayMs : 3000);

  const renderer = new ConveyorRenderer(resolvedCfg, {
    onBrickClick: (brickId: string, x: number, y: number) => {
      gameState.handleBrickInteraction(brickId, gameState.elapsed, { x, y });
    },
    onBrickHold: (brickId: string, holdDurationMs: number, x: number, y: number) => {
      gameState.handleBrickHold(brickId, holdDurationMs, gameState.elapsed, { x, y });
    },
    onBrickHover: (brickId: string, isHovering: boolean, x: number, y: number) => {
      gameState.handleBrickHover(brickId, isHovering, gameState.elapsed, { x, y });
    },
    onPointerDebug: (event: Record<string, unknown>) => {
      logEvent({ ...event, type: 'pointer_debug', pointer_event: event.type, time: gameState.elapsed });
      if (resolvedCfg?.debug?.pointerConsole) {
        console.info('[pointer-debug]', event);
      }
    },
    runtimeLengths: runtimeConveyorLengths,
    seed: ((baseSeed >>> 0) + ((trial.trialIndex + 1) * 2654435761)) >>> 0,
  });

  await renderer.init(container);
  renderer.toggleVisualDRT(false, legacyDrtRaw?.stim_visual_config);

  let drtPresentation: ReturnType<typeof createDrtPresentationBridge> | null = null;
  let activeStimulusId: string | null = null;

  let animationFrameId: number | null = null;
  let ended = false;
  const activeAudioNodes = new Set<HTMLAudioElement>();
  let trialStarted = !resolvedCfg.experiment?.startTrialsOnSpace;
  const startOverlayCfg = resolvedCfg?.experiment?.startOverlay || {};

  let startOverlay: HTMLElement | null = null;
  if (!trialStarted) {
    startOverlay = document.createElement('div');
    startOverlay.className = 'trial-start-overlay';
    startOverlay.textContent = String(startOverlayCfg.text ?? 'Press the space bar to begin.');
    startOverlay.style.setProperty('--overlay-padding', String(startOverlayCfg.padding ?? '14px 18px'));
    startOverlay.style.setProperty('--overlay-bg', String(startOverlayCfg.background ?? 'rgba(255, 255, 255, 0.92)'));
    startOverlay.style.setProperty('--overlay-border', String(startOverlayCfg.border ?? '1px solid #d1d5db'));
    startOverlay.style.setProperty('--overlay-radius', String(startOverlayCfg.borderRadius ?? '8px'));
    startOverlay.style.setProperty('--overlay-color', String(startOverlayCfg.color ?? '#111827'));
    startOverlay.style.setProperty('--overlay-font-size', String(startOverlayCfg.fontSize ?? '18px'));
    startOverlay.style.pointerEvents = 'none';
    container.style.position = 'relative';
    container.appendChild(startOverlay);
  }

  const playDRTAudio = () => {
    const url = legacyDrtRaw?.stim_file_audio;
    if (!url) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
    const configuredVolume = Number(resolvedDrtConfig.audio?.volume ?? 0.6);
    audio.volume = Number.isFinite(configuredVolume) ? Math.max(0, Math.min(1, configuredVolume)) : 0.6;
    activeAudioNodes.add(audio);
    audio.addEventListener('ended', () => activeAudioNodes.delete(audio));
    audio.addEventListener('error', () => activeAudioNodes.delete(audio));
    audio.play().catch((error) => {
      console.warn('DRT audio play failed:', error);
      activeAudioNodes.delete(audio);
    });
  };
  drtPresentation = createDrtPresentationBridge(resolvedDrtConfig, {
    showVisual: () => renderer.toggleVisualDRT(true, legacyDrtRaw?.stim_visual_config),
    hideVisual: () => renderer.toggleVisualDRT(false, legacyDrtRaw?.stim_visual_config),
    playAuditory: () => playDRTAudio(),
  });
  injectedDrtRuntime?.attachBindings?.({
    displayElement: container,
    getElapsedMs: () => gameState.elapsed,
    onEvent: (event) => {
      event.time = gameState.elapsed;
      logEvent(event);
      if (drtEnabled) {
        const type = String(event.type ?? '');
        if (type === 'drt_stimulus_presented') {
          drtStatsSnapshot.presented += 1;
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : `drt_${gameState.elapsed}`;
          activeStimulusId = stimId;
          drtPresentation?.onStimStart({ id: stimId, start: gameState.elapsed, responded: false });
        } else if (type === 'drt_hit') {
          drtStatsSnapshot.hits += 1;
          drtPresentation?.onResponseHandled();
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: true });
          activeStimulusId = null;
        } else if (type === 'drt_miss') {
          drtStatsSnapshot.misses += 1;
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: false });
          activeStimulusId = null;
        } else if (type === 'drt_false_alarm') {
          drtStatsSnapshot.falseAlarms += 1;
        } else if (type === 'drt_forced_end') {
          const stimId = typeof event.stim_id === 'string' ? event.stim_id : activeStimulusId ?? `drt_${gameState.elapsed}`;
          drtPresentation?.onStimEnd({ id: stimId, start: gameState.elapsed, responded: false });
          activeStimulusId = null;
        }
      }
    },
    onStimStart: (stimulus) => drtPresentation?.onStimStart(stimulus),
    onStimEnd: (stimulus) => drtPresentation?.onStimEnd(stimulus),
  });

  let lastFrame: number | null = null;
  let nextAutoActionAt = 0;
  let finalizedDrtData: unknown | null = null;
  const emptyDrtData = {
    enabled: false,
    stats: { presented: 0, hits: 0, misses: 0, falseAlarms: 0 },
    events: [],
  };

  const cleanup = (keyHandler: (e: KeyboardEvent) => void) => {
    ended = true;
    window.removeEventListener('keydown', keyHandler);
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (finalizedDrtData === null) {
      if (drtController) {
        if (injectedDrtRuntime?.stopOnCleanup === false) {
          finalizedDrtData = drtController.exportData();
        } else {
          finalizedDrtData = drtController.stop();
        }
      } else {
        finalizedDrtData = emptyDrtData;
      }
    }
    injectedDrtRuntime?.detachBindings?.();
    drtPresentation?.hideAll();
    activeAudioNodes.forEach((audio) => audio.pause());
    activeAudioNodes.clear();
    renderer.destroy();
    host.dispose();
  };

  return await new Promise<ConveyorTrialData>((resolve) => {
    let pendingEnd: { reason: string; dueAtMs: number } | null = null;
    const endTrial = (reason: string, keyHandler: (e: KeyboardEvent) => void) => {
      if (ended) return;
      cleanup(keyHandler);
      const gameData = gameState.exportData();
      const drtData = finalizedDrtData ?? drtController?.exportData() ?? emptyDrtData;
      const frameCount = Math.max(1, frameStats.frames);
      const avgRawDtMs = frameStats.rawDtSumMs / frameCount;
      const avgFps = avgRawDtMs > 0 ? (1000 / avgRawDtMs) : 0;
      const avgTickCostMs = frameStats.tickCostSumMs / frameCount;
      const rendererPerf = renderer.getPerformanceSnapshot();
      const perfSummary = {
        frame_budget_ms: frameBudgetMs,
        frame_count: frameStats.frames,
        avg_fps: avgFps,
        raw_dt_avg_ms: avgRawDtMs,
        raw_dt_min_ms: Number.isFinite(frameStats.rawDtMinMs) ? frameStats.rawDtMinMs : 0,
        raw_dt_max_ms: frameStats.rawDtMaxMs,
        clamped_frames: frameStats.clampedFrames,
        budget_overrun_frames: frameStats.budgetOverrunFrames,
        severe_frames: frameStats.severeFrames,
        tick_cost_avg_ms: avgTickCostMs,
        tick_cost_max_ms: frameStats.tickCostMaxMs,
        budget_overrun_ratio: frameStats.frames > 0 ? (frameStats.budgetOverrunFrames / frameStats.frames) : 0,
        severe_ratio: frameStats.frames > 0 ? (frameStats.severeFrames / frameStats.frames) : 0,
        renderer: rendererPerf
      };
      const trialData: ConveyorTrialData = {
        block_label: trial.blockLabel,
        block_index: trial.blockIndex,
        trial_index: trial.trialIndex,
        trial_duration_ms: gameState.elapsed,
        end_reason: reason,
        runtime_conveyor_lengths: runtimeConveyorLengths,
        difficulty_estimate: difficultyEstimate,
        resolved_display_preset_id: resolvedDisplayPresetId,
        config_snapshot: resolvedCfg,
        game: gameData,
        drt: drtData,
        timeline_events: timelineEvents,
        performance: perfSummary,
      };
      if (debugCfg.performanceConsole) {
        console.info('[bricks-performance]', perfSummary);
      }
      if (resolvedCfg?.debug?.saveTrialLog) {
        const prefix = String(resolvedCfg?.debug?.trialLogPrefix || 'trial_debug_log');
        const stamp = Date.now();
        const filename = `${prefix}_b${trial.blockIndex}_t${trial.trialIndex}_${stamp}.json`;
        downloadJson(filename, trialData);
      }
      if (resolvedCfg?.debug?.printTrialLog) {
        console.info('[trial-debug-log]', trialData);
      }
      resolve(trialData);
    };
    const scheduleEnd = (reason: string) => {
      if (ended || pendingEnd) return;
      const delayMs = reason === 'brick_quota_met' ? brickQuotaEndDelayMs : globalEndDelayMs;
      pendingEnd = {
        reason,
        dueAtMs: gameState.elapsed + Math.max(0, delayMs),
      };
    };

    const tick = (timestamp: number) => {
      if (ended) return;
      const tickStartTs = performance.now();
      if (lastFrame === null) {
        lastFrame = timestamp;
      }
      const rawDt = timestamp - lastFrame;
      lastFrame = timestamp;
      const dt = renderer.clampFrameDelta(rawDt);
      frameStats.frames += 1;
      frameStats.rawDtSumMs += rawDt;
      frameStats.rawDtMinMs = Math.min(frameStats.rawDtMinMs, rawDt);
      frameStats.rawDtMaxMs = Math.max(frameStats.rawDtMaxMs, rawDt);
      if (dt !== rawDt) {
        frameStats.clampedFrames += 1;
      }
      if (rawDt > frameBudgetMs) {
        frameStats.budgetOverrunFrames += 1;
      }
      if (rawDt > frameBudgetMs * 2) {
        frameStats.severeFrames += 1;
      }

      gameState.step(dt);
      if (autoEnabled && trialStarted) {
        if (gameState.elapsed >= nextAutoActionAt) {
          const activeBricks = Array.from(gameState.bricks.values());
          if (activeBricks.length > 0) {
            const candidate = activeBricks[Math.floor(Math.random() * activeBricks.length)] ?? activeBricks[0];
            const holdDurationMs = sampleAutoHoldDurationMs() ?? 500;
            const point = candidate?.sprite ?? { x: 0, y: 0 };
            gameState.handleBrickHold(String(candidate.id), holdDurationMs, gameState.elapsed, {
              x: Number(point.x ?? 0),
              y: Number(point.y ?? 0),
            });
          }
          const interActionDelayMs = sampleAutoInteractionDelayMs() ?? 900;
          nextAutoActionAt = gameState.elapsed + Math.max(40, interActionDelayMs);
        }
      }
      renderer.updateBackground(dt);
      renderer.updateBelts(gameState.conveyors, dt);
      renderer.updateFurnaces(dt);
      renderer.queueDropEffects(gameState.consumeDroppedVisuals());
      renderer.updateEffects(dt);

      const focusState = gameState.getFocusState();
      renderer.syncBricks(Array.from(gameState.bricks.values()), resolvedCfg.bricks.completionMode, resolvedCfg.bricks.completionParams, focusState);
      const remainingMs = maxDuration !== null ? Math.max(0, maxDuration - gameState.elapsed) : null;
      const hudStats = gameState.getHUDStats();
      const remainingBucket = remainingMs === null ? 'none' : String(Math.floor(remainingMs / hudTimerGranularityMs));
      const hudSignature = [
        String(hudStats.timeElapsedMs),
        String(hudStats.bricksActive),
        String(hudStats.spawned),
        String(hudStats.cleared),
        String(hudStats.dropped),
        String(hudStats.points),
        String(hudStats.focusBrickId ?? ''),
        String(hudStats.focusBrickValue ?? ''),
        String(focusState?.activeBrickId ?? ''),
        remainingBucket,
        String(drtStatsSnapshot.presented),
        String(drtStatsSnapshot.hits),
        String(drtStatsSnapshot.misses),
        String(drtStatsSnapshot.falseAlarms),
      ].join('|');
      if (hudSignature !== lastHudSignature) {
        lastHudSignature = hudSignature;
        renderer.updateHUD(hudStats, remainingMs, {
          label: trial.blockLabel,
          drtStats: drtEnabled ? drtStatsSnapshot : undefined,
          focusInfo: focusState,
          drtEnabled,
        });
      }

      if (!pendingEnd && enforceBrickQuota) {
        const completed = gameState.stats.cleared + gameState.stats.dropped;
        if (completed >= brickQuota && gameState.bricks.size === 0) {
          scheduleEnd('brick_quota_met');
        }
      }

      if (!pendingEnd && maxDuration !== null && gameState.elapsed >= maxDuration) {
        scheduleEnd('time_limit');
      }

      if (pendingEnd && gameState.elapsed >= pendingEnd.dueAtMs) {
        const tickCostMs = performance.now() - tickStartTs;
        frameStats.tickCostSumMs += tickCostMs;
        frameStats.tickCostMaxMs = Math.max(frameStats.tickCostMaxMs, tickCostMs);
        endTrial(pendingEnd.reason, keyHandler);
        return;
      }
      const tickCostMs = performance.now() - tickStartTs;
      frameStats.tickCostSumMs += tickCostMs;
      frameStats.tickCostMaxMs = Math.max(frameStats.tickCostMaxMs, tickCostMs);

      animationFrameId = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (animationFrameId === null) {
        lastFrame = null;
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    if (trialStarted) {
      drtController?.start(0);
      nextAutoActionAt = sampleAutoInteractionDelayMs() ?? 900;
      startLoop();
    }

    const keyHandler = (e: KeyboardEvent) => {
      const key = e.key;
      if (!trialStarted && key === ' ') {
        e.preventDefault();
        trialStarted = true;
        if (startOverlay && startOverlay.parentNode) {
          startOverlay.parentNode.removeChild(startOverlay);
        }
        drtController?.start(gameState.elapsed);
        startLoop();
        return;
      }
      if (normalizeKey(key) === normalizeKey(resolvedDrtConfig.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', keyHandler);

    if (autoEnabled && !trialStarted) {
      const autoStartDelayMs = Math.max(100, sampleAutoInteractionDelayMs() ?? 800);
      window.setTimeout(() => {
        const event = new KeyboardEvent('keydown', { key: ' ' });
        window.dispatchEvent(event);
      }, autoStartDelayMs);
    }

    if (maxDuration !== null) {
      window.setTimeout(() => {
        scheduleEnd('time_limit');
      }, maxDuration + 20);
    }
  });
}
