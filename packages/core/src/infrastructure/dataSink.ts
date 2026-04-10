import type { CoreConfig, JSONObject, SelectionContext } from "../api/types";
import type { TaskSessionEvent, TaskSessionRunnerResult } from "../runtime/sessionRunner";
import { appendToJatos, isJatosAvailable, submitToJatos } from "./jatos";
import { postEegBridgeEvent, resolveEegBridgeConfig } from "./eegBridge";

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

function createRunId(selection: SelectionContext): string {
  return [
    selection.taskId,
    selection.variantId,
    selection.participant.participantId,
    selection.participant.sessionId,
  ].join(":");
}

function createEnvelopeBase(context: TaskDataSinkContext) {
  const { selection } = context;
  return {
    runId: createRunId(selection),
    taskId: selection.taskId,
    variantId: selection.variantId,
    participantId: selection.participant.participantId,
    studyId: selection.participant.studyId,
    sessionId: selection.participant.sessionId,
  };
}

function stripRecordsFromPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { records: _records, ...rest } = payload;
  return {
    ...rest,
    recordCount: Array.isArray(payload.records) ? payload.records.length : 0,
  };
}

export class CompositeTaskDataSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>
  implements TaskDataSink<TBlock, TTrial, TTrialResult>
{
  constructor(private readonly sinks: Array<TaskDataSink<TBlock, TTrial, TTrialResult>>) {}

  async onTaskStart(context: TaskDataSinkContext): Promise<void> {
    for (const sink of this.sinks) await sink.onTaskStart?.(context);
  }

  async onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void> {
    for (const sink of this.sinks) await sink.onSessionEvent?.(context, event);
  }

  async onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void> {
    for (const sink of this.sinks) await sink.onTrialResult?.(args);
  }

  async onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void> {
    for (const sink of this.sinks) await sink.onTaskEnd?.(args);
  }

  getStatus(): TaskDataSinkStatus {
    return this.sinks.reduce<TaskDataSinkStatus>(
      (acc, sink) => {
        const status = sink.getStatus?.();
        return {
          jatosStreamingUsed: acc.jatosStreamingUsed || Boolean(status?.jatosStreamingUsed),
          jatosStreamingFailed: acc.jatosStreamingFailed || Boolean(status?.jatosStreamingFailed),
        };
      },
      { jatosStreamingUsed: false, jatosStreamingFailed: false },
    );
  }
}

export class JatosJsonLinesSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>
  implements TaskDataSink<TBlock, TTrial, TTrialResult>
{
  private sequence = 0;
  private readonly active = isJatosAvailable();
  private hadFailure = false;
  private pending: Promise<void> = Promise.resolve();

  private async appendEnvelope<TData>(
    context: TaskDataSinkContext,
    kind: TaskDataEnvelopeKind,
    data: TData,
    meta: { blockIndex?: number; blockAttempt?: number; trialIndex?: number } = {},
  ): Promise<void> {
    if (!this.active) return;
    const envelope: TaskDataEnvelope<TData> = {
      kind,
      ts: new Date().toISOString(),
      sequence: this.sequence,
      ...createEnvelopeBase(context),
      ...(typeof meta.blockIndex === "number" ? { blockIndex: meta.blockIndex } : {}),
      ...(typeof meta.blockAttempt === "number" ? { blockAttempt: meta.blockAttempt } : {}),
      ...(typeof meta.trialIndex === "number" ? { trialIndex: meta.trialIndex } : {}),
      data,
    };
    this.sequence += 1;
    const success = await appendToJatos(`${JSON.stringify(envelope)}\n`);
    if (!success) this.hadFailure = true;
  }

  private queueEnvelope<TData>(
    context: TaskDataSinkContext,
    kind: TaskDataEnvelopeKind,
    data: TData,
    meta: { blockIndex?: number; blockAttempt?: number; trialIndex?: number } = {},
  ): void {
    if (!this.active) return;
    this.pending = this.pending
      .then(() => this.appendEnvelope(context, kind, data, meta))
      .catch(() => {
        this.hadFailure = true;
      });
  }

  async onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void> {
    this.queueEnvelope(context, "session_event", event, {
      blockIndex: event.blockIndex,
      blockAttempt: event.blockAttempt,
      trialIndex: event.trialIndex,
    });
  }

  async onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void> {
    this.queueEnvelope(
      args.context,
      "trial_result",
      {
        result: args.result,
      },
      {
        blockIndex: args.blockIndex,
        blockAttempt: args.blockAttempt,
        trialIndex: args.trialIndex,
      },
    );
  }

  async onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void> {
    await this.pending;
    await this.appendEnvelope(args.context, "task_summary", stripRecordsFromPayload(args.payload));
  }

  getStatus(): TaskDataSinkStatus {
    return {
      jatosStreamingUsed: this.active,
      jatosStreamingFailed: this.hadFailure,
    };
  }
}

export class JatosCheckpointSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>
  implements TaskDataSink<TBlock, TTrial, TTrialResult>
{
  private readonly active = isJatosAvailable();
  private hadFailure = false;
  private pending: Promise<void> = Promise.resolve();
  private trialCounter = 0;
  private checkpoints: Array<{
    ts: string;
    blockIndex: number;
    blockAttempt?: number;
    trialIndex: number;
    result: unknown;
  }> = [];

  private queueFlush(context: TaskDataSinkContext): void {
    if (!this.active) return;
    this.pending = this.pending
      .then(async () => {
        const payload = {
          kind: "checkpoint",
          ts: new Date().toISOString(),
          runId: createRunId(context.selection),
          taskId: context.selection.taskId,
          variantId: context.selection.variantId,
          participantId: context.selection.participant.participantId,
          sessionId: context.selection.participant.sessionId,
          trialCount: this.trialCounter,
          checkpoints: this.checkpoints,
        };
        const ok = await submitToJatos(payload);
        if (!ok) this.hadFailure = true;
      })
      .catch(() => {
        this.hadFailure = true;
      });
  }

  async onTrialResult(args: TaskDataSinkTrialArgs<TBlock, TTrial, TTrialResult>): Promise<void> {
    if (!this.active) return;
    this.trialCounter += 1;
    this.checkpoints.push({
      ts: new Date().toISOString(),
      blockIndex: args.blockIndex,
      ...(typeof args.blockAttempt === "number" ? { blockAttempt: args.blockAttempt } : {}),
      trialIndex: args.trialIndex,
      result: args.result,
    });
  }

  async onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void> {
    if (!this.active) return;
    if (event.type === "block_end") {
      this.queueFlush(context);
    }
  }

  async onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void> {
    if (!this.active) return;
    this.queueFlush(args.context);
    await this.pending;
  }

  getStatus(): TaskDataSinkStatus {
    return {
      // Keep final full-payload submit active; checkpoints are crash-safety only.
      jatosStreamingUsed: false,
      jatosStreamingFailed: this.hadFailure,
    };
  }
}

export class EegBridgeSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>
  implements TaskDataSink<TBlock, TTrial, TTrialResult>
{
  private hadFailure = false;

  private async post(
    context: TaskDataSinkContext,
    event: {
      kind: string;
      eventType?: string;
      blockIndex?: number;
      blockAttempt?: number;
      trialIndex?: number;
      eventData?: unknown;
      data?: unknown;
    },
  ): Promise<void> {
    const eegConfig = resolveEegBridgeConfig(context.coreConfig, context.taskConfig);
    if (!eegConfig.enabled) return;
    const ok = await postEegBridgeEvent(eegConfig, {
      kind: event.kind,
      ts: new Date().toISOString(),
      taskId: context.selection.taskId,
      variantId: context.selection.variantId,
      participantId: context.selection.participant.participantId,
      studyId: context.selection.participant.studyId,
      sessionId: context.selection.participant.sessionId,
      ...(typeof event.blockIndex === "number" ? { blockIndex: event.blockIndex } : {}),
      ...(typeof event.blockAttempt === "number" ? { blockAttempt: event.blockAttempt } : {}),
      ...(typeof event.trialIndex === "number" ? { trialIndex: event.trialIndex } : {}),
      ...(typeof event.eventType === "string" ? { eventType: event.eventType } : {}),
      ...(event.eventData === undefined ? {} : { eventData: event.eventData }),
      ...(event.data === undefined ? {} : { data: event.data }),
    });
    if (!ok) this.hadFailure = true;
  }

  async onTaskStart(context: TaskDataSinkContext): Promise<void> {
    await this.post(context, {
      kind: "session_start",
      data: {
        taskId: context.selection.taskId,
        variantId: context.selection.variantId,
      },
    });
  }

  async onSessionEvent(context: TaskDataSinkContext, event: TaskSessionEvent): Promise<void> {
    const eegConfig = resolveEegBridgeConfig(context.coreConfig, context.taskConfig);
    if (!eegConfig.enabled) return;
    const eventType = String(event.type || "").toLowerCase();
    if (!eegConfig.eventTypes.has(eventType)) return;
    await this.post(context, {
      kind: "session_event",
      eventType: event.type,
      blockIndex: event.blockIndex,
      blockAttempt: event.blockAttempt,
      trialIndex: event.trialIndex,
      ...(eegConfig.includeEventPayload && event.payload !== undefined ? { eventData: event.payload } : {}),
    });
  }

  async onTaskEnd(args: TaskDataSinkTaskEndArgs<TBlock, TTrialResult>): Promise<void> {
    await this.post(args.context, {
      kind: "session_end",
      data: {
        recordCount: Array.isArray(args.payload.records) ? args.payload.records.length : 0,
      },
    });
  }

  getStatus(): TaskDataSinkStatus {
    return {
      jatosStreamingUsed: false,
      jatosStreamingFailed: this.hadFailure,
    };
  }
}

export function createDefaultTaskDataSink<TBlock = unknown, TTrial = unknown, TTrialResult = unknown>():
  TaskDataSink<TBlock, TTrial, TTrialResult> {
  const sinks: Array<TaskDataSink<TBlock, TTrial, TTrialResult>> = [];
  if (isJatosAvailable()) {
    sinks.push(new JatosCheckpointSink<TBlock, TTrial, TTrialResult>());
  }
  sinks.push(new EegBridgeSink<TBlock, TTrial, TTrialResult>());
  return new CompositeTaskDataSink(sinks);
}
