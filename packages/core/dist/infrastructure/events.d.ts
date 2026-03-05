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
export declare function createEventLogger(selection: SelectionContext): EventLogger;
