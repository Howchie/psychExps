import type { CoreConfig, JSONObject, SelectionContext } from "./types";
export interface ResolvedAutoResponderProfile {
    enabled: boolean;
    seed: string | number;
    continueDelayMs: {
        minMs: number;
        maxMs: number;
    };
    responseRtMs: {
        meanMs: number;
        sdMs: number;
        minMs: number;
        maxMs: number;
    };
    timeoutRate: number;
    errorRate: number;
    interActionDelayMs: {
        minMs: number;
        maxMs: number;
    };
    holdDurationMs: {
        minMs: number;
        maxMs: number;
    };
    maxTrialDurationMs: number;
}
export declare function resolveAutoResponderProfile(args: {
    coreConfig: CoreConfig;
    taskConfig?: JSONObject | null;
    selection: SelectionContext;
}): ResolvedAutoResponderProfile;
export declare function configureAutoResponder(profile: ResolvedAutoResponderProfile): void;
export declare function isAutoResponderEnabled(): boolean;
export declare function getAutoResponderProfile(): ResolvedAutoResponderProfile | null;
export declare function sampleAutoContinueDelayMs(): number | null;
export declare function sampleAutoResponse(args: {
    validResponses: string[];
    expectedResponse?: string | null;
    trialDurationMs?: number | null;
}): {
    response: string | null;
    rtMs: number | null;
} | null;
export declare function sampleAutoInteractionDelayMs(): number | null;
export declare function sampleAutoHoldDurationMs(): number | null;
export declare function runJsPsychTimeline(jsPsych: any, timeline: any[]): Promise<void>;
