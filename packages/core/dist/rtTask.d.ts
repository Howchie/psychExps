import { type TrialTimelineResult } from "./trial";
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
export declare function runBasicRtTrial(args: RunBasicRtTrialArgs): Promise<BasicRtTrialResult>;
