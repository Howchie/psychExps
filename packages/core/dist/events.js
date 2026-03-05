export function createEventLogger(selection) {
    const events = [];
    const base = {
        taskId: selection.taskId,
        variantId: selection.variantId,
        participantId: selection.participant.participantId,
        studyId: selection.participant.studyId,
        sessionId: selection.participant.sessionId,
    };
    const emit = (eventType, eventData, meta) => {
        const event = {
            eventType: String(eventType || "event"),
            ts: new Date().toISOString(),
            ...base,
            ...(typeof meta?.blockIndex === "number" ? { blockIndex: meta.blockIndex } : {}),
            ...(typeof meta?.trialIndex === "number" ? { trialIndex: meta.trialIndex } : {}),
            ...(eventData === undefined ? {} : { eventData }),
        };
        events.push(event);
        return event;
    };
    return { events, emit };
}
//# sourceMappingURL=events.js.map