/**
 * Manages the full lifecycle of a task adapter.
 */
export class LifecycleManager {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    /**
     * Executes the full task lifecycle: initialize, execute, terminate.
     * If the adapter only has the legacy 'launch' method, it will use that.
     */
    async run(context) {
        try {
            if (this.adapter.initialize) {
                await this.adapter.initialize(context);
            }
            let result;
            if (this.adapter.execute) {
                result = await this.adapter.execute();
            }
            else if (this.adapter.launch) {
                // Fallback for legacy adapters
                result = await this.adapter.launch(context);
            }
            else {
                throw new Error(`Task adapter for ${this.adapter.manifest.taskId} does not have an execute or launch method.`);
            }
            return result;
        }
        finally {
            if (this.adapter.terminate) {
                await this.adapter.terminate();
            }
        }
    }
}
//# sourceMappingURL=taskAdapter.js.map