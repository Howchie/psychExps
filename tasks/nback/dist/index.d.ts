import { type TaskAdapter, type TaskAdapterContext } from "@experiments/core";
declare class NbackTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    private runtime;
    private removeKeyScrollBlocker;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
    setKeyScrollRemover(remover: () => void): void;
}
export declare const nbackAdapter: NbackTaskAdapter;
export {};
