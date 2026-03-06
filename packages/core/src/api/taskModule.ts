import type { SeededRandom } from "../infrastructure/random";

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
  onEvent?: (event: { type: string } & Record<string, unknown>) => void;
  onModularResponse?: (key: string, timestamp: number) => void;
}

/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
  private active = new Map<string, { moduleId: string; address: TaskModuleAddress; handle: TaskModuleHandle }>();
  private results: TaskModuleResult[] = [];
  private options: TaskModuleRunnerOptions = {};
  private keyListener: ((event: KeyboardEvent) => void) | null = null;

  constructor(private modules: TaskModule[] = []) {}

  /**
   * Initializes the runner, setting up global listeners.
   */
  initialize(): void {
    if (this.keyListener) return;
    this.keyListener = (event: KeyboardEvent) => {
      this.handleKey(event.key, performance.now());
    };
    window.addEventListener("keydown", this.keyListener);
  }

  /**
   * Cleans up the runner.
   */
  terminate(): void {
    if (this.keyListener) {
      window.removeEventListener("keydown", this.keyListener);
      this.keyListener = null;
    }
    this.stopAll();
  }

  setOptions(options: TaskModuleRunnerOptions): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Allows registered modules to transform the experiment plan.
   */
  transformPlan(plan: any, moduleConfigs: Record<string, any>, context: TaskModuleContext): any {
    let currentPlan = plan;
    for (const module of this.modules) {
      if (module.transformPlan) {
        const config = moduleConfigs[module.id];
        if (config) {
          currentPlan = module.transformPlan(currentPlan, config, context);
        }
      }
    }
    return currentPlan;
  }

  /**
   * Allows registered modules to transform a block's plan.
   */
  transformBlockPlan(block: any, moduleConfigs: Record<string, any>, context: TaskModuleContext): any {
    let currentBlock = block;
    for (const module of this.modules) {
      if (module.transformBlockPlan) {
        let config = moduleConfigs[module.id];
        if (config) {
          if (context.resolver) {
            config = context.resolver.resolveInValue(config, { 
              blockIndex: context.blockIndex,
              locals: context.locals
            });
          }
          currentBlock = module.transformBlockPlan(currentBlock, config, context);
        }
      }
    }
    return currentBlock;
  }

  private createScopeId(moduleId: string, address: TaskModuleAddress): string {
    return `${moduleId}:${address.scope}:${address.blockIndex ?? -1}:${address.trialIndex ?? -1}`;
  }

  /**
   * Standardized start method for a module instance.
   */
  start(args: { module: TaskModule; address: TaskModuleAddress; config: any; context: TaskModuleContext }): void {
    const { module, address, config, context } = args;
    const scopeId = this.createScopeId(module.id, address);
    if (this.active.has(scopeId)) return;

    const handle = module.start(config, address, context);
    this.active.set(scopeId, { moduleId: module.id, address, handle });
  }

  /**
   * Standardized stop method for a module instance.
   */
  stop(address: TaskModuleAddress): TaskModuleResult | undefined {
    // Find any active module at this exact address
    for (const [scopeId, entry] of this.active.entries()) {
      if (
        entry.address.scope === address.scope &&
        entry.address.blockIndex === address.blockIndex &&
        entry.address.trialIndex === address.trialIndex
      ) {
        const data = entry.handle.stop();
        this.active.delete(scopeId);

        const result: TaskModuleResult = {
          moduleId: entry.moduleId,
          ...entry.address,
          data
        };
        this.results.push(result);
        return result;
      }
    }
    return undefined;
  }

  stopAll(): TaskModuleResult[] {
    const stopped: TaskModuleResult[] = [];
    for (const [scopeId, entry] of this.active.entries()) {
      const data = entry.handle.stop();
      const result: TaskModuleResult = {
        moduleId: entry.moduleId,
        ...entry.address,
        data
      };
      this.results.push(result);
      stopped.push(result);
    }
    this.active.clear();
    return stopped;
  }

  step(now: number): void {
    for (const entry of this.active.values()) {
      entry.handle.step?.(now);
    }
  }

  handleKey(key: string, now: number): boolean {
    const entries = Array.from(this.active.values()).reverse();
    for (const entry of entries) {
      if (entry.handle.handleKey?.(key, now)) {
        this.options.onEvent?.({
          type: "module_key_handled",
          moduleId: entry.moduleId,
          address: entry.address,
          key,
          timestamp: now,
        });
        this.options.onModularResponse?.(key, now);
        return true;
      }
    }
    return false;
  }

  getResults(): TaskModuleResult[] {
    return this.results;
  }

  /**
   * Returns current data from all active modules matching the criteria.
   */
  getActiveData(criteria?: { moduleId?: string; scope?: TaskModuleScope; blockIndex?: number }): TaskModuleResult[] {
    const output: TaskModuleResult[] = [];
    for (const entry of this.active.values()) {
      if (criteria?.moduleId && entry.moduleId !== criteria.moduleId) continue;
      if (criteria?.scope && entry.address.scope !== criteria.scope) continue;
      if (criteria?.blockIndex !== undefined && entry.address.blockIndex !== criteria.blockIndex) continue;

      if (entry.handle.getData) {
        output.push({
          moduleId: entry.moduleId,
          ...entry.address,
          data: entry.handle.getData()
        });
      }
    }
    return output;
  }
}
