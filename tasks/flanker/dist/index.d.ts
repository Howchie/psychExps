import { StandardTaskInstructionConfig, type ResolvedRtTaskConfig, type JSONObject, type TrialFeedbackConfig, type ResponseSemantics } from "@experiments/core";
type FlankerCondition = "congruent" | "incongruent" | "neutral";
interface ParsedFlankerConfig {
    title: string;
    instructions: StandardTaskInstructionConfig;
    mapping: {
        leftKey: string;
        rightKey: string;
    };
    responseSemantics: ResponseSemantics;
    allowedKeys: string[];
    rtTask: ResolvedRtTaskConfig & {
        postResponseContent: "stimulus" | "blank";
        feedbackPhase: "separate" | "post_response";
    };
    display: {
        aperturePx: number;
        paddingYPx: number;
        cueHeightPx: number;
        cueMarginBottomPx: number;
        frameBackground: string;
        frameBorder: string;
        cueColor: string;
        fixationColor: string;
        fixationFontSizePx: number;
        fixationFontWeight: number;
        stimulusFontSizePx: number;
        stimulusFontWeight: number;
        stimulusColor: string;
        stimulusSpacingPx: number;
    };
    stimuli: {
        leftTarget: string;
        rightTarget: string;
        leftFlanker: string;
        rightFlanker: string;
        neutralFlanker: string;
        flankerCount: number;
    };
    feedbackDefaults: TrialFeedbackConfig;
    conditions: {
        labels: FlankerCondition[];
        quotaPerBlock: Record<string, number>;
        maxConditionRunLength: number;
    };
    blocks: Array<{
        id: string;
        label: string;
        trials: number;
        feedback: TrialFeedbackConfig;
        beforeBlockScreens: string[];
        afterBlockScreens: string[];
    }>;
}
export declare const flankerAdapter: import("@experiments/core").TaskAdapter;
export declare function parseFlankerConfig(config: JSONObject): Promise<ParsedFlankerConfig>;
export {};
