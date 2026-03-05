export interface TrialStage {
    id: string;
    durationMs: number;
    render?: () => void | string;
}
export interface TrialResponseSpec {
    allowedKeys: string[];
    startMs: number;
    endMs: number;
}
export interface TrialTimelineArgs {
    container: HTMLElement;
    stages: TrialStage[];
    response?: TrialResponseSpec | null;
}
export interface TrialStageTiming {
    id: string;
    startMs: number;
    endMs: number;
}
export interface TrialTimelineResult {
    key: string | null;
    rtMs: number | null;
    totalDurationMs: number;
    stageTimings: TrialStageTiming[];
}
export declare function runTrialTimeline(args: TrialTimelineArgs): Promise<TrialTimelineResult>;
