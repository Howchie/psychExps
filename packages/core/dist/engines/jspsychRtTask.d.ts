import { initJsPsych } from "jspsych";
export interface JsPsychRtTimelinePhaseDurations {
    preFixationBlankMs: number;
    fixationMs: number;
    blankMs: number;
    responseMs: number;
    responsePreStimulusBlankMs: number;
    responseStimulusMs: number;
    responsePostStimulusBlankMs: number;
    postResponseStimulusMs: number;
    postResponseBlankMs: number;
}
export interface JsPsychRtTimelineConfig {
    phasePrefix: string;
    responseTerminatesTrial: boolean;
    durations: JsPsychRtTimelinePhaseDurations;
    canvasSize: [number, number];
    allowedKeys: "NO_KEYS" | string | string[];
    baseData: Record<string, unknown>;
    renderFixation: (canvas: HTMLCanvasElement) => void;
    renderBlank: (canvas: HTMLCanvasElement) => void;
    renderStimulus: (canvas: HTMLCanvasElement) => void;
    renderFeedback?: (canvas: HTMLCanvasElement) => void;
    feedback?: {
        enabled: boolean;
        durationMs: number;
        phaseMode: "separate" | "post_response";
    };
    postResponseContent?: "blank" | "stimulus";
    onResponse?: (response: {
        key: string | null;
        rtMs: number | null;
    }, data: Record<string, unknown>) => void;
}
export declare function initStandardJsPsych(args: {
    displayElement: HTMLElement;
    onTrialStart?: (trial: Record<string, unknown>) => void;
    onFinish?: () => void;
}): ReturnType<typeof initJsPsych>;
export declare function buildJsPsychRtTimelineNodes(config: JsPsychRtTimelineConfig): any[];
