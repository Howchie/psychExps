import type { TaskAdapterContext, JSONObject } from "../api/types";
import { type TaskDataSink } from "../infrastructure/dataSink";
export interface TaskOrchestratorArgs<TBlock, TTrial, TTrialResult> {
    getBlocks: (taskConfig: JSONObject) => TBlock[];
    getTrials: (ctx: {
        block: TBlock;
        blockIndex: number;
    }) => TTrial[] | Promise<TTrial[]>;
    runTrial: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
        trial: TTrial;
        trialIndex: number;
        blockTrialResults: TTrialResult[];
    }) => Promise<TTrialResult>;
    onTaskStart?: () => Promise<void> | void;
    onTaskEnd?: (payload: any) => Promise<void> | void;
    onBlockStart?: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
    }) => Promise<void> | void;
    onBlockEnd?: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
        trialResults: TTrialResult[];
    }) => Promise<void> | void;
    onTrialStart?: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
        trial: TTrial;
        trialIndex: number;
    }) => Promise<void> | void;
    onTrialEnd?: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
        trial: TTrial;
        trialIndex: number;
        result: TTrialResult;
    }) => Promise<void> | void;
    getTaskMetadata?: (sessionResult: any) => Record<string, unknown>;
    getEvents?: (sessionResult: any) => unknown[];
    resolveUiContainer?: (baseContainer: HTMLElement) => HTMLElement;
    buttonIdPrefix: string;
    autoFinalize?: boolean;
    csvOptions?: {
        suffix: string;
        getRecords?: (sessionResult: any) => any[];
    };
    renderInstruction?: (ctx: {
        pageText: string;
        pageHtml?: string;
        pageTitle?: string;
        pageIndex: number;
        section: string;
        blockLabel?: string | null;
    }) => string;
    introPages?: unknown;
    endPages?: unknown;
    dataSink?: TaskDataSink<TBlock, TTrial, TTrialResult>;
    getBlockUi?: (ctx: {
        block: TBlock;
        blockIndex: number;
        blockAttempt?: number;
    }) => {
        introText?: string | null;
        preBlockPages?: string[];
        postBlockPages?: string[];
        repeatPostBlockPages?: string[];
        showBlockLabel?: boolean;
        preBlockBeforeIntro?: boolean;
    };
}
export declare class TaskOrchestrator<TBlock, TTrial, TTrialResult> {
    private context;
    constructor(context: TaskAdapterContext);
    run(args: TaskOrchestratorArgs<TBlock, TTrial, TTrialResult>): Promise<unknown>;
}
