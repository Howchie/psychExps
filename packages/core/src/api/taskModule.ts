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

/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
  private active = new Map<string, { moduleId: string; address: TaskModuleAddress; handle: TaskModuleHandle }>();
  private results: TaskModuleResult[] = [];

  constructor(private modules: TaskModule[]) {}

  private getModule(id: string): TaskModule | undefined {
    return this.modules.find(m => m.id === id);
  }

  private createScopeId(moduleId: string, address: TaskModuleAddress): string {
    return `${moduleId}:${address.scope}:${address.blockIndex ?? -1}:${address.trialIndex ?? -1}`;
  }

  startScope(moduleId: string, config: any, address: TaskModuleAddress, context: TaskModuleContext): void {
    const mod = this.getModule(moduleId);
    if (!mod) return;

    const scopeId = this.createScopeId(moduleId, address);
    if (this.active.has(scopeId)) return;

    const handle = mod.start(config, address, context);
    this.active.set(scopeId, { moduleId, address, handle });
  }

  stopScope(moduleId: string, address: TaskModuleAddress): void {
    const scopeId = this.createScopeId(moduleId, address);
    const entry = this.active.get(scopeId);
    if (!entry) return;

    const data = entry.handle.stop();
    this.active.delete(scopeId);

    this.results.push({
      moduleId: entry.moduleId,
      ...entry.address,
      data
    });
  }

  stopAll(): void {
    for (const [scopeId, entry] of this.active.entries()) {
      const data = entry.handle.stop();
      this.results.push({
        moduleId: entry.moduleId,
        ...entry.address,
        data
      });
    }
    this.active.clear();
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
