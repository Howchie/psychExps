import type { SeededRandom } from "../infrastructure/random";
import type { VariableResolver } from "../infrastructure/variables";
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
    rng?: SeededRandom;
    stimuliByCategory?: Record<string, string[]>;
    resolver?: VariableResolver;
    locals?: Record<string, unknown>;
}
/**
 * A standard interface for modular task extensions (e.g., DRT, RT-Task).
 * Modules are managed by the TaskRunner and attached to specific scopes.
 */
export interface TaskModule<TConfig = any, TResult = any> {
    readonly id: string;
    /**
     * Optional: Called during task initialization to allow the module
     * to transform the experiment plan.
     */
    transformPlan?(plan: any, config: TConfig, context: TaskModuleContext): any;
    /**
     * Optional: Called during block initialization to allow the module
     * to transform the block's plan.
     */
    transformBlockPlan?(block: any, config: TConfig, context: TaskModuleContext): any;
    /**
     * Optional: Called during initialization to retrieve modular response mappings.
     */
    getModularSemantics?(config: TConfig, context: TaskModuleContext): Record<string, string | string[]>;
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
    /**
     * Optional: Called when the task wants to retrieve current data from an active module.
     */
    getData?(): TResult;
    /**
     * Optional: Called when the task wants the module to render its state.
     */
    render?(ctx: CanvasRenderingContext2D, now: number): void;
}
export interface TaskModuleResult<TResult = any> extends TaskModuleAddress {
    moduleId: string;
    data: TResult;
}
export interface TaskModuleRunnerOptions {
    onEvent?: (event: {
        type: string;
    } & Record<string, unknown>) => void;
    onModularResponse?: (key: string, timestamp: number) => void;
}
/**
 * Manages active TaskModules during an experiment run.
 */
export declare class TaskModuleRunner {
    private modules;
    private active;
    private results;
    private options;
    private keyListener;
    constructor(modules?: TaskModule[]);
    /**
     * Initializes the runner, setting up global listeners.
     */
    initialize(): void;
    /**
     * Cleans up the runner.
     */
    terminate(): void;
    setOptions(options: TaskModuleRunnerOptions): void;
    /**
     * Allows registered modules to transform the experiment plan.
     */
    transformPlan(plan: any, moduleConfigs: Record<string, any>, context: TaskModuleContext): any;
    /**
     * Allows registered modules to transform a block's plan.
     */
    transformBlockPlan(block: any, moduleConfigs: Record<string, any>, context: TaskModuleContext): any;
    /**
     * Starts all modules configured for the specified scope.
     */
    startScopedModules(args: {
        scope: TaskModuleScope;
        blockIndex: number | null;
        trialIndex: number | null;
        moduleConfigs: Record<string, any>;
        context: TaskModuleContext;
    }): void;
    /**
     * Stops all modules at the specified scope.
     */
    stopScopedModules(address: TaskModuleAddress): TaskModuleResult[];
    /**
     * Aggregates modular response semantics from all registered modules.
     */
    getModularSemantics(moduleConfigs: Record<string, any>, context: TaskModuleContext): Record<string, string | string[]>;
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
    /**
     * Returns current data from all active modules matching the criteria.
     */
    getActiveData(criteria?: {
        moduleId?: string;
        scope?: TaskModuleScope;
        blockIndex?: number;
    }): TaskModuleResult[];
}
