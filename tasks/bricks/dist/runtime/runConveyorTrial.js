// @ts-nocheck
import { createDrtPresentationBridge, createScaledCanvasHost, DrtController, getAutoResponderProfile, isAutoResponderEnabled, normalizeKey, sampleAutoHoldDurationMs, sampleAutoInteractionDelayMs, } from '@experiments/core';
import { GameState } from './game_state.js';
import { ConveyorRenderer } from './renderer_pixi.js';
import { estimateTrialDifficulty } from './difficulty_estimator.js';
import { applyDisplayPreset, resolveDisplayPresetId } from './display_presets.js';
import { resolveBricksDrtConfig } from './drtConfig.js';
const randomUint32 = () => {
    try {
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            return buf[0] >>> 0;
        }
    }
    catch {
        // fall through
    }
    return Math.floor(Math.random() * 0x100000000) >>> 0;
};
const materializeSeed = (seedSpec) => {
    if (seedSpec === undefined || seedSpec === null)
        return randomUint32();
    if (typeof seedSpec === 'string') {
        const s = seedSpec.trim().toLowerCase();
        if (s === 'random' || s === 'auto')
            return randomUint32();
        const asNum = Number(s);
        if (Number.isFinite(asNum))
            return asNum >>> 0;
        return randomUint32();
    }
    const n = Number(seedSpec);
    return Number.isFinite(n) ? (n >>> 0) : randomUint32();
};
const downloadJson = (filename, data) => {
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
    }
    catch (error) {
        console.warn('Failed to download trial debug log:', error);
    }
};
export async function runConveyorTrial(args) {
    const trial = args;
    const display_element = args.displayElement;
    const cfg = trial.config;
    const baseSeed = materializeSeed(cfg.trial?.seed);
    const resolvedDisplayPresetId = resolveDisplayPresetId(cfg, {
        baseSeed,
        trialIndex: trial.trialIndex,
    });
    const resolvedCfg = applyDisplayPreset(cfg, resolvedDisplayPresetId);
    const injectedDrtRuntime = args.drtRuntime ?? null;
    const resolvedDrtConfig = injectedDrtRuntime?.config ?? resolveBricksDrtConfig((resolvedCfg.drt || {}));
    const host = createScaledCanvasHost({
        displayElement: display_element,
        canvasWidth: Number(resolvedCfg.display.canvasWidth),
        canvasHeight: Number(resolvedCfg.display.canvasHeight),
        viewportPaddingPx: Number(resolvedCfg.display?.viewportPaddingPx ?? 24),
    });
    const container = host.container;
    const debugCfg = (resolvedCfg?.debug || {});
    const timelineEvents = [];
    const logEvent = (event) => {
        timelineEvents.push(event);
        if (debugCfg.holdConsole && event?.type === 'brick_hold' && event?.valid === true) {
            const holdMs = Number(event.hold_ms ?? 0);
            const progressPct = Math.max(0, Math.min(100, Number(event.progress_total ?? 0) * 100));
            console.info(`[hold-debug] brick=${event.brick_id ?? '-'} hold_ms=${Math.round(holdMs)} clear_pct=${progressPct.toFixed(1)}`);
        }
    };
    const gameState = new GameState(resolvedCfg, { onEvent: logEvent, seed: baseSeed });
    const runtimeConveyorLengths = gameState.conveyors.map((conveyor) => conveyor.length);
    const difficultyEstimate = estimateTrialDifficulty(gameState, resolvedCfg);
    const trialMode = resolvedCfg.trial?.mode ?? 'fixed_time';
    const brickQuota = Number.isFinite(resolvedCfg.bricks?.maxBricksPerTrial) ? resolvedCfg.bricks.maxBricksPerTrial : null;
    const enforceBrickQuota = trialMode === 'max_bricks' && brickQuota !== null;
    const autoProfile = getAutoResponderProfile();
    const autoEnabled = isAutoResponderEnabled();
    const maxTimeSecRaw = resolvedCfg.trial?.maxTimeSec;
    const configuredMaxDuration = Number.isFinite(maxTimeSecRaw) && maxTimeSecRaw !== null ? Math.max(0, Math.floor(maxTimeSecRaw * 1000)) : null;
    const maxDuration = configuredMaxDuration ?? (autoEnabled ? Math.max(5_000, Number(autoProfile?.maxTrialDurationMs ?? 90_000)) : null);
    const renderer = new ConveyorRenderer(resolvedCfg, {
        onBrickClick: (brickId, x, y) => {
            gameState.handleBrickInteraction(brickId, gameState.elapsed, { x, y });
        },
        onBrickHold: (brickId, holdDurationMs, x, y) => {
            gameState.handleBrickHold(brickId, holdDurationMs, gameState.elapsed, { x, y });
        },
        onBrickHover: (brickId, isHovering, x, y) => {
            gameState.handleBrickHover(brickId, isHovering, gameState.elapsed, { x, y });
        },
        onPointerDebug: (event) => {
            logEvent({ ...event, type: 'pointer_debug', pointer_event: event.type, time: gameState.elapsed });
            if (resolvedCfg?.debug?.pointerConsole) {
                console.info('[pointer-debug]', event);
            }
        },
        runtimeLengths: runtimeConveyorLengths,
        seed: ((baseSeed >>> 0) + ((trial.trialIndex + 1) * 2654435761)) >>> 0,
    });
    await renderer.init(container);
    renderer.toggleVisualDRT(false, resolvedCfg.drt?.stim_visual_config);
    let drtPresentation = null;
    const drtController = injectedDrtRuntime?.controller ??
        new DrtController({
            ...resolvedDrtConfig,
            seed: ((baseSeed >>> 0) + (trial.trialIndex + 1)) >>> 0,
        }, {
            onEvent: (event) => {
                event.time = gameState.elapsed;
                logEvent(event);
            },
            onStimStart: (stimulus) => drtPresentation?.onStimStart(stimulus),
            onStimEnd: (stimulus) => drtPresentation?.onStimEnd(stimulus),
        }, {
            displayElement: container,
            borderTargetElement: container,
        });
    let animationFrameId = null;
    let ended = false;
    const activeAudioNodes = new Set();
    let trialStarted = !resolvedCfg.experiment?.startTrialsOnSpace;
    const startOverlayCfg = resolvedCfg?.experiment?.startOverlay || {};
    let startOverlay = null;
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
        const url = resolvedCfg.drt?.stim_file_audio;
        if (!url)
            return;
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
        showVisual: () => renderer.toggleVisualDRT(true, resolvedCfg.drt?.stim_visual_config),
        hideVisual: () => renderer.toggleVisualDRT(false, resolvedCfg.drt?.stim_visual_config),
        playAuditory: () => playDRTAudio(),
    });
    injectedDrtRuntime?.attachBindings?.({
        displayElement: container,
        getElapsedMs: () => gameState.elapsed,
        onEvent: (event) => {
            event.time = gameState.elapsed;
            logEvent(event);
        },
        onStimStart: (stimulus) => drtPresentation?.onStimStart(stimulus),
        onStimEnd: (stimulus) => drtPresentation?.onStimEnd(stimulus),
    });
    let lastFrame = null;
    let nextAutoActionAt = 0;
    let finalizedDrtData = null;
    const cleanup = (keyHandler) => {
        ended = true;
        window.removeEventListener('keydown', keyHandler);
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (finalizedDrtData === null) {
            if (injectedDrtRuntime?.stopOnCleanup === false) {
                finalizedDrtData = drtController.exportData();
            }
            else {
                finalizedDrtData = drtController.stop();
            }
        }
        injectedDrtRuntime?.detachBindings?.();
        drtPresentation?.hideAll();
        activeAudioNodes.forEach((audio) => audio.pause());
        activeAudioNodes.clear();
        renderer.destroy();
        host.dispose();
    };
    return await new Promise((resolve) => {
        const endTrial = (reason, keyHandler) => {
            if (ended)
                return;
            cleanup(keyHandler);
            const gameData = gameState.exportData();
            const drtData = finalizedDrtData ?? drtController.exportData();
            const trialData = {
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
            };
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
        const tick = (timestamp) => {
            if (ended)
                return;
            if (lastFrame === null) {
                lastFrame = timestamp;
            }
            const rawDt = timestamp - lastFrame;
            lastFrame = timestamp;
            const dt = renderer.clampFrameDelta(rawDt);
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
            renderer.updateHUD(gameState.getHUDStats(), remainingMs, {
                label: trial.blockLabel,
                drtStats: drtController.exportData().stats,
                focusInfo: focusState,
                drtEnabled: resolvedDrtConfig.enabled === true,
            });
            if (enforceBrickQuota) {
                const completed = gameState.stats.cleared + gameState.stats.dropped;
                if (completed >= brickQuota && gameState.bricks.size === 0) {
                    endTrial('brick_quota_met', keyHandler);
                    return;
                }
            }
            if (maxDuration !== null && gameState.elapsed >= maxDuration) {
                endTrial('time_limit', keyHandler);
                return;
            }
            animationFrameId = requestAnimationFrame(tick);
        };
        const startLoop = () => {
            if (animationFrameId === null) {
                lastFrame = null;
                animationFrameId = requestAnimationFrame(tick);
            }
        };
        if (trialStarted) {
            drtController.start(0);
            nextAutoActionAt = sampleAutoInteractionDelayMs() ?? 900;
            startLoop();
        }
        const keyHandler = (e) => {
            const key = e.key;
            if (!trialStarted && key === ' ') {
                e.preventDefault();
                trialStarted = true;
                if (startOverlay && startOverlay.parentNode) {
                    startOverlay.parentNode.removeChild(startOverlay);
                }
                drtController.start(gameState.elapsed);
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
                endTrial('time_limit', keyHandler);
            }, maxDuration + 20);
        }
    });
}
//# sourceMappingURL=runConveyorTrial.js.map