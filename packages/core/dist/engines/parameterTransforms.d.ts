export type TransformObservationOutcome = "hit" | "miss" | "false_alarm" | "forced_end";
export interface OnlineTransformObservation {
    timeMs: number;
    rtMs: number | null;
    stimId: string | null;
    outcome: TransformObservationOutcome;
    key?: string;
    source?: string;
    meta?: Record<string, unknown>;
}
export interface ParameterEstimateInterval {
    lower: number;
    upper: number;
}
export interface OnlineParameterTransformEstimate {
    modelId: string;
    modelType: string;
    sampleSize: number;
    values: Record<string, number>;
    intervals?: Record<string, ParameterEstimateInterval>;
    aux?: Record<string, unknown>;
}
export interface OnlineParameterTransform {
    readonly id: string;
    readonly type: string;
    observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate | null;
    reset(): void;
    exportState(): Record<string, unknown>;
}
export interface WaldConjugateTransformConfig {
    type: "wald_conjugate";
    id?: string;
    enabled?: boolean;
    includeOutcomes?: Array<TransformObservationOutcome>;
    minWindowSize?: number;
    maxWindowSize?: number;
    t0?: number;
    t0Mode?: "fixed" | "min_rt_multiplier";
    t0Multiplier?: number;
    priors?: {
        mu0?: number;
        precision0?: number;
        kappa0?: number;
        beta0?: number;
    };
    credibleInterval?: {
        lower?: number;
        upper?: number;
    };
    priorUpdate?: {
        enabled?: boolean;
        mode?: "none" | "shift_means";
        shiftMu0From?: "posterior_location";
        shiftKappa0From?: "threshold_mode_sq_plus_1";
    };
}
export type OnlineParameterTransformConfig = WaldConjugateTransformConfig;
export interface OnlineTransformRuntimeData {
    id: string;
    type: string;
    updateCount: number;
    latestEstimate: OnlineParameterTransformEstimate | null;
    state: Record<string, unknown>;
}
export declare class WaldConjugateOnlineTransform implements OnlineParameterTransform {
    readonly id: string;
    readonly type: "wald_conjugate";
    private readonly includeOutcomes;
    private readonly minWindowSize;
    private readonly maxWindowSize;
    private readonly t0Mode;
    private readonly t0FixedMs;
    private readonly t0Multiplier;
    private readonly lower;
    private readonly upper;
    private readonly priorUpdateMode;
    private readonly rtWindow;
    private minObservedRtMs;
    private mu0;
    private precision0;
    private kappa0;
    private beta0;
    private updateCount;
    private latestEstimate;
    constructor(config: WaldConjugateTransformConfig);
    observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate | null;
    reset(): void;
    exportState(): Record<string, unknown>;
    getRuntimeData(): OnlineTransformRuntimeData;
    private resolveT0;
}
export declare function createOnlineParameterTransform(config: OnlineParameterTransformConfig): OnlineParameterTransform;
export declare class OnlineParameterTransformRunner {
    private readonly transforms;
    constructor(configs: OnlineParameterTransformConfig[]);
    isEnabled(): boolean;
    observe(observation: OnlineTransformObservation): OnlineParameterTransformEstimate[];
    reset(): void;
    exportData(): OnlineTransformRuntimeData[];
}
