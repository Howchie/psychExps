import { appendToJatos, isJatosAvailable, submitToJatos } from "./jatos";
function createRunId(selection) {
    return [
        selection.taskId,
        selection.variantId,
        selection.participant.participantId,
        selection.participant.sessionId,
    ].join(":");
}
function createEnvelopeBase(context) {
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
function stripRecordsFromPayload(payload) {
    const { records: _records, ...rest } = payload;
    return {
        ...rest,
        recordCount: Array.isArray(payload.records) ? payload.records.length : 0,
    };
}
export class CompositeTaskDataSink {
    sinks;
    constructor(sinks) {
        this.sinks = sinks;
    }
    async onTaskStart(context) {
        for (const sink of this.sinks)
            await sink.onTaskStart?.(context);
    }
    async onSessionEvent(context, event) {
        for (const sink of this.sinks)
            await sink.onSessionEvent?.(context, event);
    }
    async onTrialResult(args) {
        for (const sink of this.sinks)
            await sink.onTrialResult?.(args);
    }
    async onTaskEnd(args) {
        for (const sink of this.sinks)
            await sink.onTaskEnd?.(args);
    }
    getStatus() {
        return this.sinks.reduce((acc, sink) => {
            const status = sink.getStatus?.();
            return {
                jatosStreamingUsed: acc.jatosStreamingUsed || Boolean(status?.jatosStreamingUsed),
                jatosStreamingFailed: acc.jatosStreamingFailed || Boolean(status?.jatosStreamingFailed),
            };
        }, { jatosStreamingUsed: false, jatosStreamingFailed: false });
    }
}
export class JatosJsonLinesSink {
    sequence = 0;
    active = isJatosAvailable();
    hadFailure = false;
    pending = Promise.resolve();
    async appendEnvelope(context, kind, data, meta = {}) {
        if (!this.active)
            return;
        const envelope = {
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
        if (!success)
            this.hadFailure = true;
    }
    queueEnvelope(context, kind, data, meta = {}) {
        if (!this.active)
            return;
        this.pending = this.pending
            .then(() => this.appendEnvelope(context, kind, data, meta))
            .catch(() => {
            this.hadFailure = true;
        });
    }
    async onSessionEvent(context, event) {
        this.queueEnvelope(context, "session_event", event, {
            blockIndex: event.blockIndex,
            blockAttempt: event.blockAttempt,
            trialIndex: event.trialIndex,
        });
    }
    async onTrialResult(args) {
        this.queueEnvelope(args.context, "trial_result", {
            result: args.result,
        }, {
            blockIndex: args.blockIndex,
            blockAttempt: args.blockAttempt,
            trialIndex: args.trialIndex,
        });
    }
    async onTaskEnd(args) {
        await this.pending;
        await this.appendEnvelope(args.context, "task_summary", stripRecordsFromPayload(args.payload));
    }
    getStatus() {
        return {
            jatosStreamingUsed: this.active,
            jatosStreamingFailed: this.hadFailure,
        };
    }
}
export class JatosCheckpointSink {
    active = isJatosAvailable();
    hadFailure = false;
    pending = Promise.resolve();
    trialCounter = 0;
    checkpoints = [];
    queueFlush(context) {
        if (!this.active)
            return;
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
            if (!ok)
                this.hadFailure = true;
        })
            .catch(() => {
            this.hadFailure = true;
        });
    }
    async onTrialResult(args) {
        if (!this.active)
            return;
        this.trialCounter += 1;
        this.checkpoints.push({
            ts: new Date().toISOString(),
            blockIndex: args.blockIndex,
            ...(typeof args.blockAttempt === "number" ? { blockAttempt: args.blockAttempt } : {}),
            trialIndex: args.trialIndex,
            result: args.result,
        });
    }
    async onSessionEvent(context, event) {
        if (!this.active)
            return;
        if (event.type === "block_end") {
            this.queueFlush(context);
        }
    }
    async onTaskEnd(args) {
        if (!this.active)
            return;
        this.queueFlush(args.context);
        await this.pending;
    }
    getStatus() {
        return {
            // Keep final full-payload submit active; checkpoints are crash-safety only.
            jatosStreamingUsed: false,
            jatosStreamingFailed: this.hadFailure,
        };
    }
}
export function createDefaultTaskDataSink() {
    const sinks = [];
    if (isJatosAvailable()) {
        sinks.push(new JatosCheckpointSink());
    }
    return new CompositeTaskDataSink(sinks);
}
//# sourceMappingURL=dataSink.js.map