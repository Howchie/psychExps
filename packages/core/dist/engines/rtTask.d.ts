import { type TrialTimelineResult } from "../web/trial";
export interface RtTiming {
    trialDurationMs: number;
    fixationOnsetMs?: number;
    fixationDurationMs: number;
    stimulusOnsetMs: number;
    stimulusDurationMs?: number | null;
    responseWindowStartMs: number;
    responseWindowEndMs: number;
}
export interface RtPhaseDurations {
    trialDurationMs: number;
    fixationMs: number;
    blankMs: number;
    preResponseStimulusMs: number;
    responsePreStimulusBlankMs: number;
    responseStimulusMs: number;
    responsePostStimulusBlankMs: number;
    responseBlankMs: number;
    responseMs: number;
    postResponseStimulusMs: number;
    postResponseBlankMs: number;
    preFixationBlankMs: number;
    responseStartMs: number;
    responseEndMs: number;
    stimulusStartMs: number;
    stimulusEndMs: number;
    fixationStartMs: number;
    fixationEndMs: number;
}
export interface RtPhaseOptions {
    responseTerminatesTrial?: boolean;
}
export interface RunBasicRtTrialArgs {
    container: HTMLElement;
    timing: RtTiming;
    allowedKeys: string[];
    renderFixation?: () => void | string;
    renderBlank?: () => void | string;
    renderStimulus: () => void | string;
    responseTerminatesTrial?: boolean;
}
export interface BasicRtTrialResult {
    key: string | null;
    rtMs: number | null;
    timings: RtPhaseDurations;
    timeline: TrialTimelineResult;
}
export declare function computeRtPhaseDurations(timing: RtTiming, options?: RtPhaseOptions): RtPhaseDurations;
export interface TrialPhase {
    id: string;
    durationMs: number;
    render?: () => void | string;
}
export interface RunMultiPhaseTrialArgs {
    container: HTMLElement;
    phases: TrialPhase[];
    response: {
        allowedKeys: string[];
        startMs: number;
        endMs: number;
    };
}
export interface MultiPhaseTrialResult {
    key: string | null;
    rtMs: number | null;
    timeline: TrialTimelineResult;
}
export interface RunCustomRtTrialArgs {
    container: HTMLElement;
    stages: TrialStage[];
    response: TrialResponseSpec;
}
export declare function runCustomRtTrial(args: RunCustomRtTrialArgs): Promise<MultiPhaseTrialResult>;
export declare function runBasicRtTrial(args: RunBasicRtTrialArgs): Promise<BasicRtTrialResult>;
