/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
    modules;
    active = new Map();
    results = [];
    options = {};
    constructor(modules = []) {
        this.modules = modules;
    }
    setOptions(options) {
        this.options = { ...this.options, ...options };
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
        let handled = false;
        for (const entry of this.active.values()) {
            if (entry.handle.handleKey?.(key, now)) {
                handled = true;
            }
        }
        return handled;
    }
    getResults() {
        return this.results;
    }
}
//# sourceMappingURL=taskModule.js.map