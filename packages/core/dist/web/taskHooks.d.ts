import { type EvaluateTrialOutcomeArgs, type TrialOutcome } from "../web/outcome";
type MaybePromise<T> = T | Promise<T>;
export type HookPhase = "task_start" | "task_end" | "block_start" | "block_end" | "trial_start" | "trial_end" | "custom";
export interface TaskHookEvent<TPayload = unknown> {
    name: string;
    phase?: HookPhase;
    payload?: TPayload;
    trialIndex?: number;
    blockIndex?: number;
    timestampMs?: number;
}
export interface HookErrorContext {
    hookId: string;
    phase: HookPhase;
    eventName?: string;
}
export interface HookExecutionOptions {
    continueOnError?: boolean;
    onError?: (error: unknown, context: HookErrorContext) => void;
}
export interface HookStateStore {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): void;
    update<T = unknown>(key: string, updater: (current: T | undefined) => T): T;
    delete(key: string): void;
    clear(): void;
    entries(): Array<[string, unknown]>;
}
export interface TaskHookContext {
    hookId: string;
    state: HookStateStore;
}
export interface TaskHookLifecycleContext<TBlock = unknown, TTrial = unknown> extends TaskHookContext {
    block?: TBlock;
    blockIndex?: number;
    trial?: TTrial;
    trialIndex?: number;
}
export interface TaskHookEventContext<TBlock = unknown, TTrial = unknown> extends TaskHookLifecycleContext<TBlock, TTrial> {
    event: TaskHookEvent;
}
export interface TrialPlanHookContext<TTrial, TBlock = unknown> {
    trial: TTrial;
    trialIndex: number;
    block: TBlock;
    blockIndex: number;
    state: HookStateStore;
    hookId: string;
}
export interface TrialPlanHook<TTrial, TBlock = unknown> {
    id?: string;
    priority?: number;
    enabled?: boolean;
    onTrialPlanned?(context: TrialPlanHookContext<TTrial, TBlock>): MaybePromise<TTrial | void>;
}
export interface TrialOutcomeHook {
    id?: string;
    priority?: number;
    enabled?: boolean;
    beforeEvaluate?(args: EvaluateTrialOutcomeArgs, context: TaskHookContext): MaybePromise<Partial<EvaluateTrialOutcomeArgs> | void>;
    afterEvaluate?(args: {
        input: EvaluateTrialOutcomeArgs;
        outcome: TrialOutcome;
    }, context: TaskHookContext): MaybePromise<Partial<TrialOutcome> | void>;
}
export interface TaskHook<TTrial = unknown, TBlock = unknown> extends TrialPlanHook<TTrial, TBlock>, TrialOutcomeHook {
    onTaskStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onTaskEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onBlockStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onBlockEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onTrialStart?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onTrialEnd?(context: TaskHookLifecycleContext<TBlock, TTrial>): MaybePromise<void>;
    onEvent?(context: TaskHookEventContext<TBlock, TTrial>): MaybePromise<void>;
}
export interface PreparedTaskHook<TTrial = unknown, TBlock = unknown> extends TaskHook<TTrial, TBlock> {
    id: string;
    order: number;
}
export interface PrepareTaskHooksOptions {
    defaultPrefix?: string;
}
export declare function createHookStateStore(initial?: Record<string, unknown> | null): HookStateStore;
export declare function prepareTaskHooks<TTrial = unknown, TBlock = unknown>(hooks?: Array<TaskHook<TTrial, TBlock> | null | undefined> | null, options?: PrepareTaskHooksOptions): PreparedTaskHook<TTrial, TBlock>[];
export interface RunTaskHookLifecycleArgs<TTrial = unknown, TBlock = unknown> {
    phase: HookPhase;
    hooks?: Array<TaskHook<TTrial, TBlock> | PreparedTaskHook<TTrial, TBlock> | null | undefined> | null;
    context?: Omit<TaskHookLifecycleContext<TBlock, TTrial>, "hookId" | "state">;
    state?: HookStateStore;
    options?: HookExecutionOptions;
}
export declare function runTaskHookLifecycle<TTrial = unknown, TBlock = unknown>(args: RunTaskHookLifecycleArgs<TTrial, TBlock>): Promise<void>;
export interface EmitTaskHookEventArgs<TTrial = unknown, TBlock = unknown> {
    event: TaskHookEvent;
    hooks?: Array<TaskHook<TTrial, TBlock> | PreparedTaskHook<TTrial, TBlock> | null | undefined> | null;
    context?: Omit<TaskHookEventContext<TBlock, TTrial>, "hookId" | "state" | "event">;
    state?: HookStateStore;
    options?: HookExecutionOptions;
}
export declare function emitTaskHookEvent<TTrial = unknown, TBlock = unknown>(args: EmitTaskHookEventArgs<TTrial, TBlock>): Promise<void>;
export interface EvaluateTrialOutcomeWithHooksArgs extends EvaluateTrialOutcomeArgs {
    hooks?: Array<TrialOutcomeHook | TaskHook | null | undefined> | null;
    state?: HookStateStore;
    options?: HookExecutionOptions;
}
export declare function evaluateTrialOutcomeWithHooks(args: EvaluateTrialOutcomeWithHooksArgs): TrialOutcome;
export declare function evaluateTrialOutcomeWithHooksAsync(args: EvaluateTrialOutcomeWithHooksArgs): Promise<TrialOutcome>;
export interface ApplyTrialPlanHooksArgs<TTrial, TBlock = unknown> {
    trial: TTrial;
    context: Omit<TrialPlanHookContext<TTrial, TBlock>, "trial" | "state" | "hookId">;
    hooks?: Array<TrialPlanHook<TTrial, TBlock> | TaskHook<TTrial, TBlock> | null | undefined> | null;
    state?: HookStateStore;
    options?: HookExecutionOptions;
}
export declare function applyTrialPlanHooks<TTrial, TBlock = unknown>(trialOrArgs: TTrial | ApplyTrialPlanHooksArgs<TTrial, TBlock>, legacyContext?: Omit<TrialPlanHookContext<TTrial, TBlock>, "trial" | "state" | "hookId">, legacyHooks?: Array<TrialPlanHook<TTrial, TBlock> | TaskHook<TTrial, TBlock> | null | undefined> | null): TTrial;
export declare function applyTrialPlanHooksAsync<TTrial, TBlock = unknown>(args: ApplyTrialPlanHooksArgs<TTrial, TBlock>): Promise<TTrial>;
export {};
