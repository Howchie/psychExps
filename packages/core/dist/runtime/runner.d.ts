export type RunnerId = "native" | "jspsych";
export interface TaskRunner<TContext = unknown, TResult = unknown> {
    id: RunnerId;
    run: (context: TContext) => Promise<TResult>;
}
export interface SelectRunnerArgs<TContext = unknown, TResult = unknown> {
    context: TContext;
    taskConfig?: unknown;
    preferredRunner?: RunnerId | null;
    defaultRunner?: RunnerId;
    supportedRunners: TaskRunner<TContext, TResult>[];
}
export interface TaskRunnerSelection<TContext = unknown, TResult = unknown> {
    runnerId: RunnerId;
    runner: TaskRunner<TContext, TResult>;
}
export declare function resolveRunnerPreference(taskConfig: unknown): RunnerId | null;
export declare function selectRunner<TContext = unknown, TResult = unknown>(args: SelectRunnerArgs<TContext, TResult>): TaskRunnerSelection<TContext, TResult>;
export interface RunWithRunnerArgs<TContext = unknown, TResult = unknown> extends SelectRunnerArgs<TContext, TResult> {
}
export declare function runWithRunner<TContext = unknown, TResult = unknown>(args: RunWithRunnerArgs<TContext, TResult>): Promise<TaskRunnerSelection<TContext, TResult> & {
    result: TResult;
}>;
