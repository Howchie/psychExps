import { type TaskAdapter, type TaskAdapterContext } from "@experiments/core";
declare class StroopTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    private removeKeyScrollBlocker;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
    setKeyScrollRemover(remover: () => void): void;
}
export declare const stroopAdapter: StroopTaskAdapter;
export {};
