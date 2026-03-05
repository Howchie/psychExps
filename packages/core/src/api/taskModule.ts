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
  onEvent?: (event: { type: string } & Record<string, unknown>) => void;
}

/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
  private active = new Map<string, { moduleId: string; address: TaskModuleAddress; handle: TaskModuleHandle }>();
  private results: TaskModuleResult[] = [];
  private options: TaskModuleRunnerOptions = {};

  constructor(private modules: TaskModule[] = []) {}

  setOptions(options: TaskModuleRunnerOptions): void {
    this.options = { ...this.options, ...options };
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
    let handled = false;
    for (const entry of this.active.values()) {
      if (entry.handle.handleKey?.(key, now)) {
        handled = true;
      }
    }
    return handled;
  }

  getResults(): TaskModuleResult[] {
    return this.results;
  }
}
