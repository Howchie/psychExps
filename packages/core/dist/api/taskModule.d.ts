export type TaskModuleScope = "task" | "block" | "trial";
export interface TaskModuleAddress {
    scope: TaskModuleScope;
    blockIndex: number | null;
    trialIndex: number | null;
}
export interface TaskModuleContext<TBlock = unknown, TTrial = unknown> {
    block?: TBlock;
    blockIndex?: number;
    trial?: TTrial;
    trialIndex?: number;
    displayElement?: HTMLElement;
    borderTargetElement?: HTMLElement;
    borderTargetRect?: () => DOMRect | null;
}
/**
 * A standard interface for modular task extensions (e.g., DRT, RT-Task).
 * Modules are managed by the TaskRunner and attached to specific scopes.
 */
export interface TaskModule<TConfig = any, TResult = any> {
    readonly id: string;
    /**
     * Called when the module's scope starts.
     * Returns a handle to the active module instance.
     */
    start(config: TConfig, address: TaskModuleAddress, context: TaskModuleContext): TaskModuleHandle<TResult>;
}
export interface TaskModuleHandle<TResult = any> {
    /**
     * Called when the module's scope ends.
     * Returns the final result/data for this scope instance.
     */
    stop(): TResult;
    /**
     * Optional: Called on every animation frame if the module needs to tick.
     */
    step?(now: number): void;
    /**
     * Optional: Called when a key is pressed.
     * Return true if the key was handled by this module.
     */
    handleKey?(key: string, now: number): boolean;
}
export interface TaskModuleResult<TResult = any> extends TaskModuleAddress {
    moduleId: string;
    data: TResult;
}
export interface TaskModuleRunnerOptions {
    onEvent?: (event: {
        type: string;
    } & Record<string, unknown>) => void;
}
/**
 * Manages active TaskModules during an experiment run.
 */
export declare class TaskModuleRunner {
    private modules;
    private active;
    private results;
    private options;
    constructor(modules?: TaskModule[]);
    setOptions(options: TaskModuleRunnerOptions): void;
    private createScopeId;
    /**
     * Standardized start method for a module instance.
     */
    start(args: {
        module: TaskModule;
        address: TaskModuleAddress;
        config: any;
        context: TaskModuleContext;
    }): void;
    /**
     * Standardized stop method for a module instance.
     */
    stop(address: TaskModuleAddress): TaskModuleResult | undefined;
    stopAll(): TaskModuleResult[];
    step(now: number): void;
    handleKey(key: string, now: number): boolean;
    getResults(): TaskModuleResult[];
}
