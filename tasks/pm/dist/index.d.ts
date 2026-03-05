import { type TaskAdapter, type TaskAdapterContext } from "@experiments/core";
declare class PmTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    private runtime;
    private removeKeyScrollBlocker;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
}
export declare const pmAdapter: PmTaskAdapter;
export {};
