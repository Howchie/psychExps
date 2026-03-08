import { asString } from "../utils/coerce";
/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
    modules;
    active = new Map();
    results = [];
    options = {};
    keyListener = null;
    constructor(modules = []) {
        this.modules = modules;
    }
    /**
     * Initializes the runner, setting up global listeners.
     */
    initialize() {
        if (this.keyListener)
            return;
        this.keyListener = (event) => {
            this.handleKey(event.key, performance.now());
        };
        window.addEventListener("keydown", this.keyListener);
    }
    /**
     * Cleans up the runner.
     */
    terminate() {
        if (this.keyListener) {
            window.removeEventListener("keydown", this.keyListener);
            this.keyListener = null;
        }
        this.stopAll();
    }
    setOptions(options) {
        this.options = { ...this.options, ...options };
    }
    /**
     * Allows registered modules to transform the experiment plan.
     */
    transformPlan(plan, moduleConfigs, context) {
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
    transformBlockPlan(block, moduleConfigs, context) {
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
    /**
     * Starts all modules configured for the specified scope.
     */
    startScopedModules(args) {
        const { scope, blockIndex, trialIndex, moduleConfigs, context } = args;
        for (const module of this.modules) {
            let config = moduleConfigs[module.id];
            if (config && config.enabled !== false) {
                // Resolve config if it wasn't already resolved (e.g. if passed raw)
                if (context.resolver) {
                    config = context.resolver.resolveInValue(config, {
                        ...(blockIndex == null ? {} : { blockIndex }),
                        ...(trialIndex == null ? {} : { trialIndex }),
                        locals: context.locals,
                    });
                }
                const moduleScope = (asString(config.scope) || "block").toLowerCase();
                if (moduleScope === scope) {
                    this.start({
                        module,
                        address: { scope, blockIndex, trialIndex },
                        config,
                        context,
                    });
                }
            }
        }
    }
    /**
     * Stops all modules at the specified scope.
     */
    stopScopedModules(address) {
        const results = [];
        for (const [scopeId, entry] of this.active.entries()) {
            if (entry.address.scope === address.scope &&
                entry.address.blockIndex === address.blockIndex &&
                entry.address.trialIndex === address.trialIndex) {
                const data = entry.handle.stop();
                this.active.delete(scopeId);
                const result = {
                    moduleId: entry.moduleId,
                    ...entry.address,
                    data,
                };
                this.results.push(result);
                results.push(result);
            }
        }
        return results;
    }
    createScopeId(moduleId, address) {
        return `${moduleId}:${address.scope}:${address.blockIndex ?? -1}:${address.trialIndex ?? -1}`;
    }
    /**
     * Standardized start method for a module instance.
     */
    start(args) {
        const { module, address, config, context } = args;
        const scopeId = this.createScopeId(module.id, address);
        if (this.active.has(scopeId))
            return;
        const handle = module.start(config, address, context);
        this.active.set(scopeId, { moduleId: module.id, address, handle });
    }
    /**
     * Standardized stop method for a module instance.
     */
    stop(address) {
        // Find any active module at this exact address
        for (const [scopeId, entry] of this.active.entries()) {
            if (entry.address.scope === address.scope &&
                entry.address.blockIndex === address.blockIndex &&
                entry.address.trialIndex === address.trialIndex) {
                const data = entry.handle.stop();
                this.active.delete(scopeId);
                const result = {
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
    stopAll() {
        const stopped = [];
        for (const [scopeId, entry] of this.active.entries()) {
            const data = entry.handle.stop();
            const result = {
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
    step(now) {
        for (const entry of this.active.values()) {
            entry.handle.step?.(now);
        }
    }
    handleKey(key, now) {
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
    getResults() {
        return this.results;
    }
    /**
     * Returns current data from all active modules matching the criteria.
     */
    getActiveData(criteria) {
        const output = [];
        for (const entry of this.active.values()) {
            if (criteria?.moduleId && entry.moduleId !== criteria.moduleId)
                continue;
            if (criteria?.scope && entry.address.scope !== criteria.scope)
                continue;
            if (criteria?.blockIndex !== undefined && entry.address.blockIndex !== criteria.blockIndex)
                continue;
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
//# sourceMappingURL=taskModule.js.map