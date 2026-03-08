import { type TaskAdapter, type TaskAdapterContext } from "@experiments/core";
declare class TrackingTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
}
export declare const trackingAdapter: TrackingTaskAdapter;
export {};
