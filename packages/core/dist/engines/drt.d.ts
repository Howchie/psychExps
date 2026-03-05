import { OnlineParameterTransformRunner, type OnlineParameterTransformConfig, type OnlineParameterTransformEstimate, type OnlineTransformObservation, type OnlineTransformRuntimeData } from "../web/parameterTransforms";
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
export type DrtEventType = "drt_stimulus_presented" | "drt_hit" | "drt_miss" | "drt_false_alarm" | "drt_response" | "drt_forced_end";
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
export declare function normalizeDrtKey(value: unknown): string;
export declare class DrtEngine {
    readonly enabled: boolean;
    readonly key: string;
    readonly responseDeadlineMs: number;
    private readonly nextIsiMs;
    private readonly onEvent;
    private nextStimAt;
    private nextStimId;
    private activeStim;
    private readonly events;
    private readonly stats;
    constructor(config: DrtEngineConfig, options?: {
        onEvent?: (event: DrtEvent) => void;
    });
    private emit;
    start(startTimeMs?: number): void;
    step(nowMs: number, hooks?: DrtStepHooks): void;
    handleKey(eventKey: unknown, nowMs: number, hooks?: Pick<DrtStepHooks, "onStimEnd">): boolean;
    forceEnd(nowMs: number, hooks?: Pick<DrtStepHooks, "onStimEnd">): void;
    exportData(): DrtEngineData;
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
export declare function coerceScopedDrtConfig(base: ScopedDrtConfig, overrideRaw: Record<string, unknown> | null | undefined): ScopedDrtConfig;
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
export declare function createDrtPresentationBridge(config: ScopedDrtConfig, adapter: DrtPresentationAdapter): DrtPresentationBridge;
/**
 * BROWSER RUNTIME DRT CONTROLLER
 */
export interface DrtControllerHooks {
    onEvent?: (event: DrtEvent) => void;
    onTransformEstimate?: (estimate: OnlineParameterTransformEstimate, context: {
        responseEvent: DrtEvent;
        observation: OnlineTransformObservation;
    }) => void;
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
}
export declare class DrtController {
    readonly enabled: boolean;
    private readonly hooks;
    private readonly now;
    private readonly engine;
    private readonly config;
    private readonly displayElement;
    private readonly borderTargetElement;
    private readonly borderTargetRect;
    private readonly transformRunner;
    private readonly responseRows;
    private rafId;
    private started;
    private epochMs;
    private activePresentation;
    private visualElement;
    private borderOverlayElement;
    private audioContext;
    private readonly onKeyDownBound;
    constructor(config: DrtControllerConfig, hooks?: DrtControllerHooks, options?: DrtControllerOptions);
    isRunning(): boolean;
    start(startOffsetMs?: number): void;
    stop(): DrtEngineData;
    static asTaskModule(config: ScopedDrtConfig & {
        onControllerCreated?: (c: DrtController) => void;
    }): TaskModule;
    handleKey(eventKey: unknown): boolean;
    exportData(): DrtEngineData;
    exportTransformData(): OnlineTransformRuntimeData[];
    exportResponseRows(): DrtResponseTransformRow[];
    private elapsedNowMs;
    private handleEngineEvent;
    private mapResponseEventToObservation;
    private scheduleNextFrame;
    private handleStimStart;
    private handleStimEnd;
    private tickPresentationTimeout;
    private showPresentation;
    private hidePresentation;
    private ensureVisualElement;
    private showVisual;
    private hideVisual;
    private resolveBorderTarget;
    private ensureBorderOverlayElement;
    private showBorder;
    private hideBorder;
    private playTone;
    private disposePresenters;
}
/**
 * TASK MODULE IMPLEMENTATION
 */
export interface DrtModuleResult {
    engine: DrtEngineData;
    transforms: OnlineTransformRuntimeData[];
    responseRows: DrtResponseTransformRow[];
}
export declare class DrtModule implements TaskModule<ScopedDrtConfig, DrtModuleResult> {
    private options;
    readonly id = "drt";
    constructor(options?: Omit<DrtControllerOptions, "transformRunner">);
    start(config: ScopedDrtConfig, address: TaskModuleAddress, context: TaskModuleContext): TaskModuleHandle<DrtModuleResult>;
}
