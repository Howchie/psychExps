import { type TaskAdapter, type TaskAdapterContext } from '@experiments/core';
declare class BricksTaskAdapter implements TaskAdapter {
    readonly manifest: TaskAdapter["manifest"];
    private context;
    private runner;
    initialize(context: TaskAdapterContext): Promise<void>;
    execute(): Promise<unknown>;
    terminate(): Promise<void>;
}
export declare const bricksAdapter: BricksTaskAdapter;
export {};
