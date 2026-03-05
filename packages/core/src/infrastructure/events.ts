import type { SelectionContext } from "../api/types";

export interface EventEnvelope<TData = unknown> {
  eventType: string;
  ts: string;
  taskId: string;
  variantId: string;
  participantId: string;
  studyId: string;
  sessionId: string;
  blockIndex?: number;
  trialIndex?: number;
  eventData?: TData;
}

export interface EventEmitMeta {
  blockIndex?: number;
  trialIndex?: number;
}

export interface EventLogger {
  events: EventEnvelope[];
  emit: <TData = unknown>(eventType: string, eventData?: TData, meta?: EventEmitMeta) => EventEnvelope<TData>;
}

export function createEventLogger(selection: SelectionContext): EventLogger {
  const events: EventEnvelope[] = [];
  const base = {
    taskId: selection.taskId,
    variantId: selection.variantId,
    participantId: selection.participant.participantId,
    studyId: selection.participant.studyId,
    sessionId: selection.participant.sessionId,
  };

  const emit = <TData = unknown>(
    eventType: string,
    eventData?: TData,
    meta?: EventEmitMeta,
  ): EventEnvelope<TData> => {
    const event: EventEnvelope<TData> = {
      eventType: String(eventType || "event"),
      ts: new Date().toISOString(),
      ...base,
      ...(typeof meta?.blockIndex === "number" ? { blockIndex: meta.blockIndex } : {}),
      ...(typeof meta?.trialIndex === "number" ? { trialIndex: meta.trialIndex } : {}),
      ...(eventData === undefined ? {} : { eventData }),
    };
    events.push(event as EventEnvelope);
    return event;
  };

  return { events, emit };
}
