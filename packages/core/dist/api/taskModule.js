/**
 * Manages active TaskModules during an experiment run.
 */
export class TaskModuleRunner {
    modules;
    active = new Map();
    results = [];
    constructor(modules) {
        this.modules = modules;
    }
    getModule(id) {
        return this.modules.find(m => m.id === id);
    }
    createScopeId(moduleId, address) {
        return `${moduleId}:${address.scope}:${address.blockIndex ?? -1}:${address.trialIndex ?? -1}`;
    }
    startScope(moduleId, config, address, context) {
        const mod = this.getModule(moduleId);
        if (!mod)
            return;
        const scopeId = this.createScopeId(moduleId, address);
        if (this.active.has(scopeId))
            return;
        const handle = mod.start(config, address, context);
        this.active.set(scopeId, { moduleId, address, handle });
    }
    stopScope(moduleId, address) {
        const scopeId = this.createScopeId(moduleId, address);
        const entry = this.active.get(scopeId);
        if (!entry)
            return;
        const data = entry.handle.stop();
        this.active.delete(scopeId);
        this.results.push({
            moduleId: entry.moduleId,
            ...entry.address,
            data
        });
    }
    stopAll() {
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