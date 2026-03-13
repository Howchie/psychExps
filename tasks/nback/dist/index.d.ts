import { createEventLogger, TaskModuleRunner, type TrialFeedbackConfig, type ResolvedRtTaskConfig, type DrtControllerConfig, type TaskAdapter, type TaskAdapterContext, type VariableResolver, type ResponseSemantics, type CsvStimulusConfig, type PoolDrawConfig } from "@experiments/core";
declare class NbackTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    private runtime;
    private removeKeyScrollBlocker;
    private removePageScrollLock;
    private rootPresentationState;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
    setKeyScrollRemover(remover: () => void): void;
    setPageScrollLockRemover(remover: () => void): void;
}
export declare const nbackAdapter: NbackTaskAdapter;
interface NbackMapping {
    targetKey: string;
    nonTargetKey: string | null;
}
type NbackDrtConfig = DrtControllerConfig & {
    enabled: boolean;
    scope: "block" | "trial";
    key: string;
    responseWindowMs: number;
    displayDurationMs: number;
    responseTerminatesStimulus: boolean;
    isiSampler: unknown;
    transformPersistence: "scope" | "session";
};
interface NbackTiming {
    trialDurationMs: number;
    fixationDurationMs: number;
    stimulusOnsetMs: number;
    responseWindowStartMs: number;
    responseWindowEndMs: number;
}
interface NbackBlockConfig {
    label: string;
    isPractice: boolean;
    nLevel: number;
    trials: number;
    nbackSourceCategories: string[];
    targetCount: number;
    lureCount: number;
    stimulusVariant: number | null;
    feedback: TrialFeedbackConfig;
    rtTask: ResolvedRtTaskConfig;
    blockSummary: Record<string, unknown> | null;
    repeatUntil: Record<string, unknown> | null;
    beforeBlockScreens: string[];
    afterBlockScreens: string[];
    repeatAfterBlockScreens: string[];
    drt: NbackDrtConfig;
    variables: Record<string, unknown>;
}
interface NbackRuleConfig {
    lureLagPasses: number[][];
    maxInsertionAttempts: number;
}
interface PlannedTrial {
    trialIndex: number;
    blockIndex: number;
    trialType: string;
    item: string;
    sourceCategory: string;
    itemCategory: string;
    correctResponse: string;
    expectedCategory?: string;
    usedAsSource?: boolean;
}
interface PlannedBlock {
    blockIndex: number;
    label: string;
    blockType: string;
    isPractice: boolean;
    nLevel: number;
    stimulusVariant: number | null;
    trials: PlannedTrial[];
    feedback: TrialFeedbackConfig;
    rtTask: ResolvedRtTaskConfig;
    blockSummary: Record<string, unknown> | null;
    repeatUntil: Record<string, unknown> | null;
    beforeBlockScreens: string[];
    afterBlockScreens: string[];
    repeatAfterBlockScreens: string[];
    drt: NbackDrtConfig;
    variables: Record<string, unknown>;
}
interface ParsedNbackConfig {
    title: string;
    mapping: NbackMapping;
    responseSemantics: ResponseSemantics;
    timing: NbackTiming;
    display: {
        aperturePx: number;
        paddingYPx: number;
        cueHeightPx: number;
        cueMarginBottomPx: number;
        frameBackground: string;
        frameBorder: string;
        textColor: string;
        fixationFontSizePx: number;
        fixationFontWeight: number;
        stimulusFontSizePx: number;
        stimulusScale: number;
        imageWidthPx: number | null;
        imageHeightPx: number | null;
        imageUpscale: boolean;
    };
    rtTask: ResolvedRtTaskConfig;
    drt: NbackDrtConfig;
    imageAssets: {
        enabled: boolean;
        basePath: string;
        filenameTemplate: string;
        practiceVariant: number;
        mainVariants: number[];
        mainMode: "with_replacement" | "cycle";
    };
    stimuliCsv: CsvStimulusConfig | null;
    nbackPoolDraw: PoolDrawConfig;
    variableDefinitions: Record<string, unknown>;
    allowedKeys: string[];
    instructions: {
        introPages: string[];
        preBlockPages: string[];
        postBlockPages: string[];
        endPages: string[];
        blockIntroTemplate: string;
        showBlockLabel: boolean;
        preBlockBeforeBlockIntro: boolean;
    };
    practiceBlocks: NbackBlockConfig[];
    mainBlocks: NbackBlockConfig[];
    stimuliByCategory: Record<string, string[]>;
    nbackRule: NbackRuleConfig;
    feedbackDefaults: TrialFeedbackConfig;
    redirectCompleteTemplate: string;
}
interface PreloadedStimulus {
    image: HTMLImageElement | null;
}
interface NbackRuntimeState {
    parsed: ParsedNbackConfig;
    plan: PlannedBlock[];
    variableResolver: VariableResolver;
    moduleRunner: TaskModuleRunner;
    moduleConfigs: Record<string, any>;
    eventLogger: ReturnType<typeof createEventLogger>;
    participantId: string;
    variantId: string;
}
interface RootPresentationState {
    maxWidth: string;
    margin: string;
    fontFamily: string;
    lineHeight: string;
    hadCenteredClass: boolean;
}
interface NbackTrialCapture {
    responseWindowRow: Record<string, unknown> | null;
}
declare function appendJsPsychNbackTrial(args: {
    timeline: any[];
    parsed: ParsedNbackConfig;
    block: PlannedBlock;
    trial: PlannedTrial;
    resolvedStimulus: string;
    runtime: NbackRuntimeState;
    preloaded: PreloadedStimulus;
    eventLogger: ReturnType<typeof createEventLogger>;
}): NbackTrialCapture;
declare function readNbackTrialResponseRow(capture: NbackTrialCapture, blockIndex: number, trialIndex: number): Record<string, unknown>;
declare function applyNbackRootPresentation(root: HTMLElement): RootPresentationState;
declare function restoreNbackRootPresentation(root: HTMLElement, prior: RootPresentationState | null): void;
export declare const __testing__: {
    appendJsPsychNbackTrial: typeof appendJsPsychNbackTrial;
    readNbackTrialResponseRow: typeof readNbackTrialResponseRow;
    applyNbackRootPresentation: typeof applyNbackRootPresentation;
    restoreNbackRootPresentation: typeof restoreNbackRootPresentation;
};
export {};
