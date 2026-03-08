import { type TaskAdapter, type TaskAdapterContext, type TaskManifest } from "@experiments/core";
declare class ChangeDetectionTaskAdapter implements TaskAdapter {
    readonly manifest: TaskManifest;
    private context;
    private layoutManager;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    private runTrial;
    terminate(): Promise<void>;
}
export declare const changeDetectionAdapter: ChangeDetectionTaskAdapter;
export {};
