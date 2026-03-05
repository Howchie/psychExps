export type TaskSessionScope = "task" | "block" | "trial";
export interface TaskSessionScopeContext<TBlock = unknown, TTrial = unknown> {
    scope: TaskSessionScope;
    block?: TBlock;
    blockIndex?: number;
    trial?: TTrial;
    trialIndex?: number;
}
export interface TaskSessionEvent<TPayload = Record<string, unknown>> {
    type: string;
    payload?: TPayload;
    blockIndex?: number;
    trialIndex?: number;
}
export interface TaskSessionRunnerHooks<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> {
    onTaskStart?: () => Promise<void> | void;
    onTaskEnd?: () => Promise<void> | void;
    onBlockStart?: (ctx: {
        block: TBlock;
        blockIndex: number;
    }) => Promise<void> | void;
    onBlockEnd?: (ctx: {
        block: TBlock;
        blockIndex: number;
        trialResults: TTrialResult[];
    }) => Promise<void> | void;
    onTrialStart?: (ctx: {
        block: TBlock;
        blockIndex: number;
        trial: TTrial;
        trialIndex: number;
    }) => Promise<void> | void;
    onTrialEnd?: (ctx: {
        block: TBlock;
        blockIndex: number;
        trial: TTrial;
        trialIndex: number;
        result: TTrialResult;
    }) => Promise<void> | void;
    onEvent?: (event: TaskSessionEvent) => Promise<void> | void;
}
export interface TaskSessionRunnerArgs<TBlock, TTrial, TTrialResult> {
    blocks: TBlock[];
    getTrials: (ctx: {
        block: TBlock;
        blockIndex: number;
    }) => TTrial[] | Promise<TTrial[]>;
    runTrial: (ctx: {
        block: TBlock;
        blockIndex: number;
        trial: TTrial;
        trialIndex: number;
        blockTrialResults: TTrialResult[];
    }) => Promise<TTrialResult>;
    hooks?: TaskSessionRunnerHooks<TBlock, TTrial, TTrialResult>;
}
export interface TaskSessionRunnerBlockResult<TBlock, TTrialResult> {
    block: TBlock;
    blockIndex: number;
    trialResults: TTrialResult[];
}
export interface TaskSessionRunnerResult<TBlock, TTrialResult> {
    blocks: Array<TaskSessionRunnerBlockResult<TBlock, TTrialResult>>;
}
/**
 * Generic async task/session runner:
 * - task start/end lifecycle
 * - block start/end lifecycle
 * - trial start/end lifecycle
 *
 * This runner is intentionally renderer-agnostic and timeline-agnostic.
 */
export declare function runTaskSession<TBlock, TTrial, TTrialResult>(args: TaskSessionRunnerArgs<TBlock, TTrial, TTrialResult>): Promise<TaskSessionRunnerResult<TBlock, TTrialResult>>;
