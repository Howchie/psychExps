import type { TaskManifest, TaskAdapterContext } from "./types";
/**
 * A standardized interface for a task adapter.
 */
export interface TaskAdapter {
    /**
     * Returns metadata about the task and its variants.
     */
    readonly manifest: TaskManifest;
    /**
     * Called to set up the task before execution (e.g., parse configuration, initialize resources).
     */
    initialize(context: TaskAdapterContext): Promise<void>;
    /**
     * Called to execute the main task logic.
     * Returns the final data or results from the task run.
     */
    execute(): Promise<unknown>;
    /**
     * Called after execution, even if it failed, to clean up resources (e.g., stop timers, clear global listeners).
     */
    terminate(): Promise<void>;
    /**
     * LEGACY: The old launch method. Will be removed once all tasks are migrated.
     */
    launch?(context: TaskAdapterContext): Promise<void>;
}
/**
 * Manages the full lifecycle of a task adapter.
 */
export declare class LifecycleManager {
    private adapter;
    constructor(adapter: TaskAdapter);
    /**
     * Executes the full task lifecycle: initialize, execute, terminate.
     * If the adapter only has the legacy 'launch' method, it will use that.
     */
    run(context: TaskAdapterContext): Promise<unknown>;
}
