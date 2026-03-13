import type { CoreConfig, JSONObject, SelectionContext } from "../api/types";
import type { TaskSessionEvent, TaskSessionRunnerResult } from "../runtime/sessionRunner";
export type TaskDataEnvelopeKind = "session_event" | "trial_result" | "task_summary";
export interface TaskDataEnvelope<TData = unknown> {
    kind: TaskDataEnvelopeKind;
    ts: string;
    sequence: number;
    runId: string;
    taskId: string;
    variantId: string;
    participantId: string;
    studyId: string;
    sessionId: string;
    blockIndex?: number;
    blockAttempt?: number;
    trialIndex?: number;
    data: TData;
}
export interface TaskDataSinkContext {
    coreConfig: CoreConfig;
    selection: SelectionContext;
    taskConfig: JSONObject;
    rawTaskConfig: JSONObject;
}
export interface TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult> {
    context: TaskDataSinkContext;
    block: TBlock;
    blockIndex: number;
    blockAttempt?: number;
    trial: TTrial;
    trialIndex: number;
    result: TTrialResult;
}
export interface TaskDataSinkTaskEndArgs<TBlock, TTrialResult> {
    context: TaskDataSinkContext;
    payload: Record<string, unknown>;
    sessionResult: TaskSessionRunnerResult<TBlock, TTrialResult>;
}
export interface TaskDataSinkStatus {
    jatosStreamingUsed: boolean;
    jatosStreamingFailed: boolean;
}
export interface TaskDataSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> {
    onTaskStart?: (context: TaskDataSinkContext) => Promise<void> | void;
    onSessionEvent?: (context: TaskDataSinkContext, event: TaskSessionEvent) => Promise<void> | void;
    onTrialResult?: (args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>) => Promise<void> | void;
    onTaskEnd?: (args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>) => Promise<void> | void;
    getStatus?: () => TaskDataSinkStatus;
}
export declare class CompositeTaskDataSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> implements TaskDataSink<TBlock, TTrial, TTrialResult> {
    private readonly sinks;
    constructor(sinks: Array<TaskDataSink<TBlock, TTrial, TTrialResult>>);
    onTaskStart(context: TaskDataSinkContext): Promise<void>;
    onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void>;
    onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void>;
    onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void>;
    getStatus(): TaskDataSinkStatus;
}
export declare class JatosJsonLinesSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> implements TaskDataSink<TBlock, TTrial, TTrialResult> {
    private sequence;
    private readonly active;
    private hadFailure;
    private pending;
    private appendEnvelope;
    private queueEnvelope;
    onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void>;
    onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void>;
    onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void>;
    getStatus(): TaskDataSinkStatus;
}
export declare class JatosCheckpointSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> implements TaskDataSink<TBlock, TTrial, TTrialResult> {
    private readonly active;
    private hadFailure;
    private pending;
    private trialCounter;
    private checkpoints;
    private queueFlush;
    onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void>;
    onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void>;
    onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void>;
    getStatus(): TaskDataSinkStatus;
}
export declare function createDefaultTaskDataSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>(): TaskDataSink<TBlock, TTrial, TTrialResult>;
