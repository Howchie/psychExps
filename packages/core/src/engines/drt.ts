import { asArray, asObject, asString, toNonNegativeNumber, toPositiveNumber, toUnitNumber } from "../utils/coerce";
import { normalizeKey } from "../infrastructure/keys";
import { SeededRandom } from "../infrastructure/random";
import { createSampler } from "../infrastructure/sampling";
import {
  OnlineParameterTransformRunner,
  type OnlineParameterTransformConfig,
  type OnlineParameterTransformEstimate,
  type OnlineTransformObservation,
  type OnlineTransformRuntimeData,
} from "./parameterTransforms";
import type { TaskModule, TaskModuleHandle, TaskModuleAddress, TaskModuleContext } from "../api/taskModule";

/**
 * CORE DRT ENGINE LOGIC
 */

export interface DrtStats {
  presented: number;
  hits: number;
  misses: number;
  falseAlarms: number;
}

export type DrtEventType =
  | "drt_stimulus_presented"
  | "drt_hit"
  | "drt_miss"
  | "drt_false_alarm"
  | "drt_response"
  | "drt_forced_end";

export interface DrtEvent {
  time: number;
  type: DrtEventType;
  stim_id?: string | null;
  key?: string;
  rt?: number;
  rt_ms?: number | null;
  hit?: boolean;
  latency?: number;
  note?: string;
}

export interface DrtStimulusState {
  id: string;
  start: number;
  responded: boolean;
}

export interface DrtStepHooks {
  onStimStart?: (stimulus: DrtStimulusState) => void;
  onStimEnd?: (stimulus: DrtStimulusState) => void;
}

export interface DrtEngineConfig {
  enabled?: boolean;
  key?: string;
  responseWindowMs?: number;
  responseDeadlineMs?: number;
  nextIsiMs: () => number;
}

export interface DrtEngineData {
  enabled: boolean;
  stats: DrtStats;
  events: DrtEvent[];
}

const defaultStats = (): DrtStats => ({
  presented: 0,
  hits: 0,
  misses: 0,
  falseAlarms: 0,
});

export function normalizeDrtKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value === " ") return " ";
  const keyString = String(value).toLowerCase();
  if (keyString === "space" || keyString === "spacebar") return " ";
  return keyString;
}

export class DrtEngine {
  readonly enabled: boolean;
  readonly key: string;
  readonly responseDeadlineMs: number;

  private readonly nextIsiMs: () => number;
  private readonly onEvent: (event: DrtEvent) => void;

  private nextStimAt = 0;
  private nextStimId = 0;
  private activeStim: DrtStimulusState | null = null;
  private readonly events: DrtEvent[] = [];
  private readonly stats: DrtStats = defaultStats();

  constructor(config: DrtEngineConfig, options?: { onEvent?: (event: DrtEvent) => void }) {
    this.enabled = Boolean(config.enabled);
    this.key = normalizeDrtKey(config.key);
    this.responseDeadlineMs = Math.max(1, Number(config.responseWindowMs ?? config.responseDeadlineMs ?? 1500));
    this.nextIsiMs = config.nextIsiMs;
    this.onEvent = options?.onEvent ?? (() => {});
  }

  private emit(type: DrtEventType, payload: Omit<DrtEvent, "type">): void {
    const event: DrtEvent = { type, ...payload };
    this.events.push(event);
    this.onEvent(event);
  }

  start(startTimeMs = 0): void {
    if (!this.enabled) return;
    this.nextStimAt = startTimeMs + Math.max(0, this.nextIsiMs());
  }

  step(nowMs: number, hooks?: DrtStepHooks): void {
    if (!this.enabled) return;

    if (!this.activeStim && nowMs >= this.nextStimAt) {
      const stim: DrtStimulusState = {
        id: `drt${++this.nextStimId}`,
        start: nowMs,
        responded: false,
      };
      this.activeStim = stim;
      this.stats.presented += 1;
      this.emit("drt_stimulus_presented", { time: nowMs, stim_id: stim.id });
      hooks?.onStimStart?.(stim);
    }

    if (!this.activeStim) return;
    if (this.activeStim.responded) return;

    const latency = nowMs - this.activeStim.start;
    if (latency < this.responseDeadlineMs) return;

    this.stats.misses += 1;
    this.emit("drt_miss", { time: nowMs, stim_id: this.activeStim.id, latency });
    this.emit("drt_response", {
      time: nowMs,
      stim_id: this.activeStim.id,
      key: this.key,
      hit: false,
      rt_ms: null,
    });
    hooks?.onStimEnd?.(this.activeStim);
    this.activeStim = null;
    this.nextStimAt = nowMs + Math.max(0, this.nextIsiMs());
  }

  handleKey(eventKey: unknown, nowMs: number, hooks?: Pick<DrtStepHooks, "onStimEnd">): boolean {
    if (!this.enabled) return false;

    const key = normalizeDrtKey(eventKey);
    if (key !== this.key) {
      this.stats.falseAlarms += 1;
      this.emit("drt_false_alarm", { time: nowMs, key });
      this.emit("drt_response", { time: nowMs, stim_id: null, key, hit: false, rt_ms: null });
      return false;
    }

    if (!this.activeStim) {
      this.stats.falseAlarms += 1;
      this.emit("drt_false_alarm", { time: nowMs, key, note: "no_active_stimulus" });
      this.emit("drt_response", { time: nowMs, stim_id: null, key, hit: false, rt_ms: null });
      return false;
    }

    const stim = this.activeStim;
    stim.responded = true;
    const rt = nowMs - stim.start;
    this.stats.hits += 1;
    this.emit("drt_hit", { time: nowMs, stim_id: stim.id, rt });
    this.emit("drt_response", { time: nowMs, stim_id: stim.id, key, hit: true, rt_ms: rt });
    hooks?.onStimEnd?.(stim);
    this.activeStim = null;
    this.nextStimAt = nowMs + Math.max(0, this.nextIsiMs());
    return true;
  }

  forceEnd(nowMs: number, hooks?: Pick<DrtStepHooks, "onStimEnd">): void {
    if (!this.activeStim) return;
    const stim = this.activeStim;
    this.emit("drt_forced_end", { time: nowMs, stim_id: stim.id });
    hooks?.onStimEnd?.(stim);
    this.activeStim = null;
  }

  exportData(): DrtEngineData {
    return {
      enabled: this.enabled,
      stats: { ...this.stats },
      events: this.events.slice(),
    };
  }
}

/**
 * DRT CONFIGURATION & COERCION
 */

export type DrtStimMode = "visual" | "auditory" | "border";

export interface DrtVisualPresentationConfig {
  shape?: "square" | "circle";
  color?: string;
  sizePx?: number;
  topPx?: number;
  leftPx?: number | null;
  zIndex?: number;
}

export interface DrtAuditoryPresentationConfig {
  volume?: number;
  frequencyHz?: number;
  durationMs?: number;
  waveform?: OscillatorType;
}

export interface DrtBorderPresentationConfig {
  color?: string;
  widthPx?: number;
  radiusPx?: number;
  target?: "display" | "viewport";
}

export interface DrtControllerConfig {
  enabled?: boolean;
  key?: string;
  responseWindowMs?: number;
  responseDeadlineMs?: number;
  displayDurationMs?: number;
  responseTerminatesStimulus?: boolean;
  nextIsiMs?: () => number;
  isiSampler?: unknown;
  seed?: number;
  stimMode?: DrtStimMode | "audiovisual" | "visual_border" | "auditory_border" | "all";
  stimModes?: DrtStimMode[];
  visual?: DrtVisualPresentationConfig;
  audio?: DrtAuditoryPresentationConfig;
  border?: DrtBorderPresentationConfig;
  parameterTransforms?: OnlineParameterTransformConfig[];
}

export type ScopedDrtConfig = DrtControllerConfig & {
  enabled: boolean;
  scope: "block" | "trial";
  key: string;
  responseWindowMs: number;
  displayDurationMs: number;
  responseTerminatesStimulus: boolean;
  isiSampler: unknown;
  transformPersistence: "scope" | "session";
};

export function coerceScopedDrtConfig(
  base: ScopedDrtConfig,
  overrideRaw: Record<string, unknown> | null | undefined,
): ScopedDrtConfig {
  if (!overrideRaw) return { ...base };
  const legacyStimType = (asString(overrideRaw.stim_type) || "").toLowerCase();
  const stimModeRaw = asString(overrideRaw.stimMode) || asString(overrideRaw.stim_mode);
  const visualRaw = asObject(overrideRaw.visual) ?? asObject(overrideRaw.stim_visual_config);
  const audioRaw = asObject(overrideRaw.audio);
  const borderRaw = asObject(overrideRaw.border);
  const stimModesRaw = asArray(overrideRaw.stimModes).map((entry) => asString(entry)).filter((entry): entry is "visual" | "auditory" | "border" => (
    entry === "visual" || entry === "auditory" || entry === "border"
  ));
  const hasStimModesOverride = Object.prototype.hasOwnProperty.call(overrideRaw, "stimModes");
  const hasExplicitStimMode = Boolean(stimModeRaw) || legacyStimType === "audio" || legacyStimType === "border";
  const resolvedStimMode = (stimModeRaw ||
    (legacyStimType === "audio" ? "auditory" : legacyStimType === "border" ? "border" : base.stimMode)) as ScopedDrtConfig["stimMode"];
  const resolvedStimModes = hasStimModesOverride
    ? (stimModesRaw.length > 0 ? stimModesRaw : undefined)
    : (hasExplicitStimMode ? undefined : base.stimModes);

  return {
    ...base,
    enabled: typeof overrideRaw.enabled === "boolean" ? overrideRaw.enabled : base.enabled,
    scope: (asString(overrideRaw.scope) || base.scope) === "trial" ? "trial" : "block",
    key: normalizeKey(asString(overrideRaw.key) || base.key),
    transformPersistence:
      (asString(overrideRaw.transformPersistence ?? overrideRaw.transform_persistence) || base.transformPersistence) === "session"
        ? "session"
        : "scope",
    responseWindowMs: toPositiveNumber(
      overrideRaw.responseWindowMs ?? overrideRaw.response_window_ms ?? overrideRaw.responseDeadlineMs ?? overrideRaw.response_deadline_ms,
      base.responseWindowMs,
    ),
    displayDurationMs: toPositiveNumber(
      overrideRaw.displayDurationMs ?? overrideRaw.display_duration_ms,
      base.displayDurationMs,
    ),
    responseTerminatesStimulus:
      overrideRaw.responseTerminatesStimulus === undefined && overrideRaw.response_terminates_stimulus === undefined
        ? base.responseTerminatesStimulus
        : overrideRaw.responseTerminatesStimulus !== false && overrideRaw.response_terminates_stimulus !== false,
    isiSampler: overrideRaw.isiSampler ?? overrideRaw.isi_sampler ?? base.isiSampler,
    parameterTransforms: asArray(
      overrideRaw.parameterTransforms ?? overrideRaw.parameter_transforms ?? overrideRaw.transforms ?? base.parameterTransforms,
    ).flatMap((entry) => {
      const parsed = asObject(entry);
      if (!parsed || typeof parsed.type !== "string") return [];
      return [parsed as unknown as OnlineParameterTransformConfig];
    }),
    stimMode: resolvedStimMode,
    stimModes: resolvedStimModes,
    visual: {
      ...base.visual,
      ...(visualRaw
        ? {
            shape: (asString(visualRaw.shape) || base.visual?.shape || "square") === "circle" ? "circle" : "square",
            color: asString(visualRaw.color) || base.visual?.color || "#dc2626",
            sizePx: toPositiveNumber(visualRaw.sizePx ?? visualRaw.size_px, Number(base.visual?.sizePx ?? 32)),
            topPx: toNonNegativeNumber(visualRaw.topPx ?? visualRaw.top_px ?? visualRaw.y, Number(base.visual?.topPx ?? 16)),
            leftPx: Number.isFinite(Number(visualRaw.leftPx ?? visualRaw.left_px ?? visualRaw.x))
              ? Number(visualRaw.leftPx ?? visualRaw.left_px ?? visualRaw.x)
              : (base.visual?.leftPx ?? null),
          }
        : {}),
    },
    audio: {
      ...base.audio,
      ...(audioRaw
        ? {
            volume: toUnitNumber(audioRaw.volume, Number(base.audio?.volume ?? 0.25)),
            frequencyHz: toPositiveNumber(audioRaw.frequencyHz ?? audioRaw.frequency_hz, Number(base.audio?.frequencyHz ?? 900)),
            durationMs: toPositiveNumber(audioRaw.durationMs ?? audioRaw.duration_ms, Number(base.audio?.durationMs ?? 120)),
            waveform: (asString(audioRaw.waveform) || base.audio?.waveform || "sine") as OscillatorType,
          }
        : {}),
    },
    border: {
      ...base.border,
      ...(borderRaw
        ? {
            color: asString(borderRaw.color) || base.border?.color || "#dc2626",
            widthPx: toPositiveNumber(borderRaw.widthPx ?? borderRaw.width_px, Number(base.border?.widthPx ?? 4)),
            radiusPx: toNonNegativeNumber(borderRaw.radiusPx ?? borderRaw.radius_px, Number(base.border?.radiusPx ?? 0)),
            target: (asString(borderRaw.target) || base.border?.target || "display") === "viewport" ? "viewport" : "display",
          }
        : {}),
    },
  };
}

/**
 * DRT PRESENTATION BRIDGE & ADAPTERS
 */

export interface DrtPresentationAdapter {
  showVisual?: (stimulus: DrtStimulusState) => void;
  hideVisual?: (stimulus: DrtStimulusState | null) => void;
  playAuditory?: (stimulus: DrtStimulusState) => void;
  showBorder?: (stimulus: DrtStimulusState) => void;
  hideBorder?: (stimulus: DrtStimulusState | null) => void;
}

export interface DrtPresentationBridge {
  readonly hasVisualMode: boolean;
  readonly hasAuditoryMode: boolean;
  readonly hasBorderMode: boolean;
  onStimStart: (stimulus: DrtStimulusState) => void;
  onStimEnd: (stimulus: DrtStimulusState) => void;
  onResponseHandled: () => void;
  hideAll: () => void;
}

function hasMode(config: ScopedDrtConfig | DrtControllerConfig, mode: "visual" | "auditory" | "border"): boolean {
  if (Array.isArray(config.stimModes) && config.stimModes.length > 0) {
    return config.stimModes.includes(mode);
  }
  return config.stimMode === mode;
}

export function createDrtPresentationBridge(
  config: ScopedDrtConfig,
  adapter: DrtPresentationAdapter,
): DrtPresentationBridge {
  const hasVisualMode = hasMode(config, "visual");
  const hasAuditoryMode = hasMode(config, "auditory");
  const hasBorderMode = hasMode(config, "border");

  const hideVisual = (stimulus: DrtStimulusState | null) => {
    if (!hasVisualMode) return;
    adapter.hideVisual?.(stimulus);
  };
  const hideBorder = (stimulus: DrtStimulusState | null) => {
    if (!hasBorderMode) return;
    adapter.hideBorder?.(stimulus);
  };

  return {
    hasVisualMode,
    hasAuditoryMode,
    hasBorderMode,
    onStimStart: (stimulus) => {
      if (hasAuditoryMode) adapter.playAuditory?.(stimulus);
      if (hasVisualMode) adapter.showVisual?.(stimulus);
      if (hasBorderMode) adapter.showBorder?.(stimulus);
    },
    onStimEnd: (stimulus) => {
      hideVisual(stimulus);
      hideBorder(stimulus);
    },
    onResponseHandled: () => {
      if (config.responseTerminatesStimulus !== false) {
        hideVisual(null);
        hideBorder(null);
      }
    },
    hideAll: () => {
      hideVisual(null);
      hideBorder(null);
    },
  };
}

/**
 * BROWSER RUNTIME DRT CONTROLLER
 */

export interface DrtControllerHooks {
  onEvent?: (event: DrtEvent) => void;
  onTransformEstimate?: (
    estimate: OnlineParameterTransformEstimate,
    context: { responseEvent: DrtEvent; observation: OnlineTransformObservation },
  ) => void;
  onStimStart?: (stimulus: DrtStimulusState) => void;
  onStimEnd?: (stimulus: DrtStimulusState) => void;
  onStimulusShown?: (stimulus: DrtStimulusState) => void;
  onStimulusHidden?: (stimulus: DrtStimulusState) => void;
}

export interface DrtControllerOptions {
  now?: () => number;
  displayElement?: HTMLElement | null;
  borderTargetElement?: HTMLElement | null;
  borderTargetRect?: () => DOMRect | null;
  transformRunner?: OnlineParameterTransformRunner | null;
  onControllerCreated?: (controller: DrtController) => void;
}

export interface DrtResponseTransformRow {
  responseIndex: number;
  response: DrtEvent;
  observation: OnlineTransformObservation;
  estimates: OnlineParameterTransformEstimate[];
  estimate: OnlineParameterTransformEstimate | null;
  transformColumns: Record<string, string | number | null>;
}

interface NormalizedControllerConfig {
  enabled: boolean;
  key: string;
  responseWindowMs: number;
  displayDurationMs: number;
  responseTerminatesStimulus: boolean;
  modes: Set<DrtStimMode>;
  nextIsiMs: () => number;
  visual: Required<DrtVisualPresentationConfig>;
  audio: Required<DrtAuditoryPresentationConfig>;
  border: Required<DrtBorderPresentationConfig>;
}

interface ActivePresentation {
  stim: DrtStimulusState;
  visible: boolean;
  hideAtMs: number;
}

function normalizeControllerModes(config: DrtControllerConfig): Set<DrtStimMode> {
  if (Array.isArray(config.stimModes) && config.stimModes.length > 0) {
    return new Set(config.stimModes.filter((mode) => mode === "visual" || mode === "auditory" || mode === "border"));
  }
  const mode = String(config.stimMode ?? "visual").toLowerCase();
  if (mode === "auditory") return new Set<DrtStimMode>(["auditory"]);
  if (mode === "border") return new Set<DrtStimMode>(["border"]);
  if (mode === "audiovisual") return new Set<DrtStimMode>(["visual", "auditory"]);
  if (mode === "visual_border") return new Set<DrtStimMode>(["visual", "border"]);
  if (mode === "auditory_border") return new Set<DrtStimMode>(["auditory", "border"]);
  if (mode === "all") return new Set<DrtStimMode>(["visual", "auditory", "border"]);
  return new Set<DrtStimMode>(["visual"]);
}

function createNextIsiMs(config: DrtControllerConfig): () => number {
  if (typeof config.nextIsiMs === "function") return config.nextIsiMs;
  const rng = new SeededRandom(Math.floor(Number(config.seed ?? 1)) >>> 0);
  const sampler = createSampler(
    config.isiSampler ?? { type: "uniform", min: 3000, max: 5000 },
    { rng: { next: () => rng.next() } },
  );
  return () => toPositiveNumber(sampler(), 5000);
}

function normalizeControllerConfig(config: DrtControllerConfig): NormalizedControllerConfig {
  const responseWindowMs = toPositiveNumber(config.responseWindowMs ?? config.responseDeadlineMs, 1500);
  return {
    enabled: Boolean(config.enabled),
    key: String(config.key ?? "space"),
    responseWindowMs,
    displayDurationMs: toPositiveNumber(config.displayDurationMs, 1000),
    responseTerminatesStimulus: config.responseTerminatesStimulus !== false,
    modes: normalizeControllerModes(config),
    nextIsiMs: createNextIsiMs(config),
    visual: {
      shape: config.visual?.shape === "circle" ? "circle" : "square",
      color: String(config.visual?.color ?? "#dc2626"),
      sizePx: Math.max(6, Math.round(toPositiveNumber(config.visual?.sizePx, 32))),
      topPx: Math.max(0, Math.round(toPositiveNumber(config.visual?.topPx, 16))),
      leftPx: Number.isFinite(Number(config.visual?.leftPx)) ? Number(config.visual?.leftPx) : null,
      zIndex: Math.max(1, Math.round(toPositiveNumber(config.visual?.zIndex, 999999))),
    },
    audio: {
      volume: Math.min(1, Math.max(0, Number(config.audio?.volume ?? 0.25))),
      frequencyHz: Math.max(80, toPositiveNumber(config.audio?.frequencyHz, 900)),
      durationMs: Math.max(20, toPositiveNumber(config.audio?.durationMs, 120)),
      waveform: config.audio?.waveform ?? "sine",
    },
    border: {
      color: String(config.border?.color ?? "#dc2626"),
      widthPx: Math.max(1, Math.round(toPositiveNumber(config.border?.widthPx, 4))),
      radiusPx: Math.max(0, Math.round(toPositiveNumber(config.border?.radiusPx, 0))),
      target: config.border?.target === "viewport" ? "viewport" : "display",
    },
  };
}

export class DrtController {
  readonly enabled: boolean;

  private readonly hooks: DrtControllerHooks;
  private readonly now: () => number;
  private readonly engine: DrtEngine;
  private readonly config: NormalizedControllerConfig;
  private readonly displayElement: HTMLElement | null;
  private readonly borderTargetElement: HTMLElement | null;
  private readonly borderTargetRect: (() => DOMRect | null) | null;
  private readonly transformRunner: OnlineParameterTransformRunner | null;
  private readonly responseRows: DrtResponseTransformRow[] = [];

  private rafId: number | null = null;
  private started = false;
  private epochMs = 0;
  private activePresentation: ActivePresentation | null = null;
  private visualElement: HTMLDivElement | null = null;
  private borderOverlayElement: HTMLDivElement | null = null;
  private audioContext: AudioContext | null = null;

  private readonly onKeyDownBound = (event: KeyboardEvent) => {
    if (!this.started || !this.enabled) return;
    this.handleKey(event.key);
  };

  constructor(
    config: DrtControllerConfig,
    hooks: DrtControllerHooks = {},
    options: DrtControllerOptions = {},
  ) {
    this.config = normalizeControllerConfig(config);
    const engineConfig: DrtEngineConfig = {
      enabled: this.config.enabled,
      key: this.config.key,
      responseWindowMs: this.config.responseWindowMs,
      nextIsiMs: this.config.nextIsiMs,
    };
    this.hooks = hooks;
    this.now = options.now ?? (() => performance.now());
    this.displayElement = options.displayElement ?? null;
    this.borderTargetElement = options.borderTargetElement ?? this.displayElement ?? null;
    this.borderTargetRect = options.borderTargetRect ?? null;
    this.transformRunner = options.transformRunner ?? (Array.isArray(config.parameterTransforms) && config.parameterTransforms.length > 0
      ? new OnlineParameterTransformRunner(config.parameterTransforms)
      : null);
    this.engine = new DrtEngine(engineConfig, { onEvent: (event) => this.handleEngineEvent(event) });
    this.enabled = this.engine.enabled;
  }

  isRunning(): boolean {
    return this.started;
  }

  start(startOffsetMs = 0): void {
    if (!this.enabled || this.started) return;
    this.started = true;
    this.epochMs = this.now() - Math.max(0, Number(startOffsetMs) || 0);
    this.engine.start(Math.max(0, Number(startOffsetMs) || 0));
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.onKeyDownBound, { capture: true });
    }
    this.scheduleNextFrame();
  }

  stop(): DrtEngineData {
    if (!this.started) return this.engine.exportData();
    this.started = false;
    this.engine.forceEnd(this.elapsedNowMs(), { onStimEnd: (stimulus) => this.handleStimEnd(stimulus) });
    this.hidePresentation();
    this.disposePresenters();
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.onKeyDownBound, { capture: true });
    }
    if (this.rafId != null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    return this.engine.exportData();
  }

  static asTaskModule(config: ScopedDrtConfig & {
    onControllerCreated?: (c: DrtController) => void;
    transformRunner?: OnlineParameterTransformRunner | null;
  }): TaskModule {
    return {
      id: "drt",
      start: (moduleConfig, address, context) => {
        const controller = new DrtController(
          { ...moduleConfig, enabled: true },
          {},
          {
            displayElement: context.displayElement,
            borderTargetElement: context.borderTargetElement,
            borderTargetRect: context.borderTargetRect,
            transformRunner: config.transformRunner ?? null,
          },
        );
        config.onControllerCreated?.(controller);
        controller.start(0);
        return {
          stop: () => {
            const data = controller.stop();
            return {
              ...data,
              responseRows: controller.exportResponseRows(),
              transforms: controller.exportTransformData(),
            };
          },
          step: (now) => {
            // RAF is internal to controller, but we could sync here if needed
          },
          handleKey: (key) => {
            return controller.handleKey(key);
          },
        };
      },
    };
  }

  handleKey(eventKey: unknown): boolean {
    if (!this.started || !this.enabled) return false;
    const handled = this.engine.handleKey(eventKey, this.elapsedNowMs(), {
      onStimEnd: (stimulus) => this.handleStimEnd(stimulus),
    });
    if (handled && this.config.responseTerminatesStimulus) {
      this.hidePresentation();
    }
    return handled;
  }

  exportData(): DrtEngineData {
    return this.engine.exportData();
  }

  exportTransformData(): OnlineTransformRuntimeData[] {
    return this.transformRunner?.exportData() ?? [];
  }

  exportResponseRows(): DrtResponseTransformRow[] {
    return this.responseRows.map((row) => ({
      responseIndex: row.responseIndex,
      response: { ...row.response },
      observation: { ...row.observation },
      estimates: row.estimates.map((estimate) => ({
        ...estimate,
        values: { ...estimate.values },
        intervals: estimate.intervals ? { ...estimate.intervals } : undefined,
        aux: estimate.aux ? { ...estimate.aux } : undefined,
      })),
      estimate: row.estimate
        ? {
            ...row.estimate,
            values: { ...row.estimate.values },
            intervals: row.estimate.intervals ? { ...row.estimate.intervals } : undefined,
            aux: row.estimate.aux ? { ...row.estimate.aux } : undefined,
          }
        : null,
      transformColumns: { ...row.transformColumns },
    }));
  }

  private elapsedNowMs(): number {
    return Math.max(0, this.now() - this.epochMs);
  }

  private handleEngineEvent(event: DrtEvent): void {
    this.hooks.onEvent?.(event);
    if (!this.transformRunner?.isEnabled()) return;
    if (event.type !== "drt_response") return;

    const observation = this.mapResponseEventToObservation(event);
    if (!observation) return;
    const estimates = this.transformRunner.observe(observation);
    const primaryEstimate = estimates.length > 0 ? this.cloneEstimate(estimates[0]) : null;
    this.responseRows.push({
      responseIndex: this.responseRows.length,
      response: { ...event },
      observation: { ...observation },
      estimates: estimates.map((estimate) => this.cloneEstimate(estimate)),
      estimate: primaryEstimate,
      transformColumns: this.flattenEstimateColumns(primaryEstimate),
    });
    for (const estimate of estimates) {
      this.hooks.onTransformEstimate?.(estimate, { responseEvent: event, observation });
    }
  }

  private cloneEstimate(estimate: OnlineParameterTransformEstimate): OnlineParameterTransformEstimate {
    return {
      ...estimate,
      values: { ...estimate.values },
      intervals: estimate.intervals ? { ...estimate.intervals } : undefined,
      aux: estimate.aux ? { ...estimate.aux } : undefined,
    };
  }

  private flattenEstimateColumns(estimate: OnlineParameterTransformEstimate | null): Record<string, string | number | null> {
    if (!estimate) return {};
    const out: Record<string, string | number | null> = {
      transform_model_id: estimate.modelId,
      transform_model_type: estimate.modelType,
      transform_sample_size: estimate.sampleSize,
    };
    for (const [key, value] of Object.entries(estimate.values ?? {})) {
      out[String(key)] = Number(value);
    }
    for (const [key, interval] of Object.entries(estimate.intervals ?? {})) {
      out[`${String(key)}_ci_lower`] = Number(interval.lower);
      out[`${String(key)}_ci_upper`] = Number(interval.upper);
    }
    for (const [key, value] of Object.entries(estimate.aux ?? {})) {
      if (value === null) {
        out[`aux_${String(key)}`] = null;
        continue;
      }
      if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        out[`aux_${String(key)}`] = typeof value === "boolean" ? String(value) : value;
      }
    }
    return out;
  }

  private mapResponseEventToObservation(event: DrtEvent): OnlineTransformObservation | null {
    const hasStimulus = typeof event.stim_id === "string" && event.stim_id.length > 0;
    let outcome: OnlineTransformObservation["outcome"] | null = null;
    if (hasStimulus) {
      outcome = event.hit ? "hit" : "miss";
    } else {
      outcome = "false_alarm";
    }
    if (!outcome) return null;
    return {
      timeMs: event.time,
      rtMs: Number.isFinite(Number(event.rt_ms)) ? Number(event.rt_ms) : null,
      stimId: hasStimulus ? String(event.stim_id) : null,
      outcome,
      key: typeof event.key === "string" ? event.key : undefined,
    };
  }

  private scheduleNextFrame(): void {
    if (!this.started || !this.enabled) return;
    if (typeof requestAnimationFrame !== "function") return;
    this.rafId = requestAnimationFrame(() => {
      this.engine.step(this.elapsedNowMs(), {
        onStimStart: (stimulus) => this.handleStimStart(stimulus),
        onStimEnd: (stimulus) => this.handleStimEnd(stimulus),
      });
      this.tickPresentationTimeout();
      this.scheduleNextFrame();
    });
  }

  private handleStimStart(stimulus: DrtStimulusState): void {
    this.activePresentation = {
      stim: stimulus,
      visible: true,
      hideAtMs: stimulus.start + this.config.displayDurationMs,
    };
    this.showPresentation();
    this.hooks.onStimStart?.(stimulus);
    this.hooks.onStimulusShown?.(stimulus);
  }

  private handleStimEnd(stimulus: DrtStimulusState): void {
    this.hidePresentation();
    this.hooks.onStimEnd?.(stimulus);
  }

  private tickPresentationTimeout(): void {
    const active = this.activePresentation;
    if (!active || !active.visible) return;
    if (this.elapsedNowMs() < active.hideAtMs) return;
    this.hidePresentation();
  }

  private showPresentation(): void {
    if (!this.activePresentation?.visible) return;
    if (this.config.modes.has("visual")) this.showVisual();
    if (this.config.modes.has("border")) this.showBorder();
    if (this.config.modes.has("auditory")) this.playTone();
  }

  private hidePresentation(): void {
    const active = this.activePresentation;
    if (!active || !active.visible) return;
    active.visible = false;
    this.hideVisual();
    this.hideBorder();
    this.hooks.onStimulusHidden?.(active.stim);
  }

  private ensureVisualElement(): HTMLDivElement | null {
    if (this.visualElement) return this.visualElement;
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    element.style.display = "none";
    element.style.zIndex = String(this.config.visual.zIndex);
    element.style.width = `${this.config.visual.sizePx}px`;
    element.style.height = `${this.config.visual.sizePx}px`;
    element.style.background = this.config.visual.color;
    element.style.top = `${this.config.visual.topPx}px`;
    if (typeof this.config.visual.leftPx === "number") {
      element.style.left = `${this.config.visual.leftPx}px`;
      element.style.transform = "";
    } else {
      element.style.left = "50%";
      element.style.transform = "translateX(-50%)";
    }
    element.style.borderRadius = this.config.visual.shape === "circle" ? "999px" : "0";
    document.body.appendChild(element);
    this.visualElement = element;
    return element;
  }

  private showVisual(): void {
    const element = this.ensureVisualElement();
    if (!element) return;
    if (typeof this.config.visual.leftPx === "number") {
      const rect = this.borderTargetRect?.() ?? this.displayElement?.getBoundingClientRect();
      const leftPx = rect ? rect.left + this.config.visual.leftPx : this.config.visual.leftPx;
      element.style.left = `${Math.round(leftPx)}px`;
      element.style.transform = "";
    } else {
      const rect = this.borderTargetRect?.() ?? this.displayElement?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        element.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      } else {
        element.style.left = "50%";
      }
      element.style.transform = "translateX(-50%)";
    }
    const rect = this.borderTargetRect?.() ?? this.displayElement?.getBoundingClientRect();
    if (rect && rect.height > 0) {
      element.style.top = `${Math.round(rect.top + this.config.visual.topPx)}px`;
    } else {
      element.style.top = `${this.config.visual.topPx}px`;
    }
    element.style.display = "block";
  }

  private hideVisual(): void {
    if (!this.visualElement) return;
    this.visualElement.style.display = "none";
  }

  private resolveBorderTarget(): HTMLElement | null {
    if (this.config.border.target === "viewport") {
      if (typeof document === "undefined") return null;
      return document.documentElement;
    }
    return this.borderTargetElement;
  }

  private ensureBorderOverlayElement(): HTMLDivElement | null {
    if (this.borderOverlayElement) return this.borderOverlayElement;
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.style.position = "fixed";
    element.style.pointerEvents = "none";
    element.style.display = "none";
    element.style.zIndex = String(Math.max(this.config.visual.zIndex, 999999));
    element.style.boxSizing = "border-box";
    document.body.appendChild(element);
    this.borderOverlayElement = element;
    return element;
  }

  private showBorder(): void {
    const overlay = this.ensureBorderOverlayElement();
    if (!overlay) return;

    if (this.config.border.target === "viewport") {
      overlay.style.left = "0px";
      overlay.style.top = "0px";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
    } else {
      const rect = this.borderTargetRect?.() ?? this.resolveBorderTarget()?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        overlay.style.display = "none";
        return;
      } else {
        overlay.style.left = `${Math.round(rect.left)}px`;
        overlay.style.top = `${Math.round(rect.top)}px`;
        overlay.style.width = `${Math.round(rect.width)}px`;
        overlay.style.height = `${Math.round(rect.height)}px`;
      }
    }

    overlay.style.border = `${this.config.border.widthPx}px solid ${this.config.border.color}`;
    overlay.style.borderRadius = `${this.config.border.radiusPx}px`;
    overlay.style.display = "block";
  }

  private hideBorder(): void {
    if (!this.borderOverlayElement) return;
    this.borderOverlayElement.style.display = "none";
  }

  private playTone(): void {
    if (typeof window === "undefined") return;
    if (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined") {
      return;
    }
    const AudioCtor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioCtor) return;
    this.audioContext ??= new AudioCtor();
    const ctx = this.audioContext;
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = this.config.audio.waveform;
    oscillator.frequency.value = this.config.audio.frequencyHz;
    gain.gain.value = this.config.audio.volume;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const durationSec = this.config.audio.durationMs / 1000;
    oscillator.start(now);
    oscillator.stop(now + durationSec);
  }

  private disposePresenters(): void {
    this.hideVisual();
    this.hideBorder();
    if (this.visualElement) {
      this.visualElement.remove();
      this.visualElement = null;
    }
    if (this.borderOverlayElement) {
      this.borderOverlayElement.remove();
      this.borderOverlayElement = null;
    }
  }
}

/**
 * TASK MODULE IMPLEMENTATION
 */

export interface DrtModuleResult {
  engine: DrtEngineData;
  transforms: OnlineTransformRuntimeData[];
  responseRows: DrtResponseTransformRow[];
}

export class DrtModule implements TaskModule<ScopedDrtConfig, DrtModuleResult> {
  readonly id = "drt";

  constructor(private options: Omit<DrtControllerOptions, "transformRunner"> = {}) {}

  getModularSemantics(config: ScopedDrtConfig): Record<string, string | string[]> {
    if (!config.enabled || !config.key) return {};
    return { drt: [normalizeKey(config.key)] };
  }

  start(config: ScopedDrtConfig, address: TaskModuleAddress, context: TaskModuleContext): TaskModuleHandle<DrtModuleResult> {
    const controller = new DrtController(
      config,
      {},
      {
        ...this.options,
      }
    );

    controller.start(0);

    return {
      stop: () => ({
        engine: controller.stop(),
        transforms: controller.exportTransformData(),
        responseRows: controller.exportResponseRows(),
      }),
      step: (now) => {
        // RAF loop is internal to DrtController for now
      },
      handleKey: (key) => {
        return controller.handleKey(key);
      }
    };
  }
}
