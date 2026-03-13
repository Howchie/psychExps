import { ConfigurationManager } from "../infrastructure/config";
import { createVariableResolver } from "../infrastructure/variables";
import { TaskModuleRunner } from "./taskModule";
import { DrtModule } from "../engines/drt";
import { ProspectiveMemoryModule } from "../engines/prospectiveMemory";
import { StimulusInjectorModule } from "../engines/stimulusInjector";
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
        // Standardize VariableResolver instantiation using SelectionContext
        const taskConfig = context.taskConfig ?? {};
        const taskVariables = taskConfig.task?.variables;
        const topVariables = taskConfig.variables;
        const variables = {
            ...(taskVariables ?? {}),
            ...(topVariables ?? {}),
        };
        const commonResolverArgs = {
            variables,
            seedParts: [
                context.selection.participant.participantId,
                context.selection.participant.sessionId,
                context.selection.variantId,
                "high_level_resolution",
            ],
        };
        // 1. High-level resolver: restricted to participant scope to prevent over-resolution
        const highLevelResolver = createVariableResolver({
            ...commonResolverArgs,
            allowedScopes: ["participant"],
        });
        // 2. Full resolver: for the task adapter to handle block and trial scopes
        const taskResolver = createVariableResolver(commonResolverArgs);
        // Resolve configuration variables after merging (static parts only)
        const configManager = new ConfigurationManager();
        configManager.validateLegacyKeys(taskConfig);
        const resolvedConfig = configManager.resolve(taskConfig, highLevelResolver);
        // Initialize module runner with standard core modules
        const moduleRunner = new TaskModuleRunner([
            new DrtModule(),
            new ProspectiveMemoryModule(),
            new StimulusInjectorModule(),
        ]);
        const resolvedContext = {
            ...context,
            taskConfig: resolvedConfig,
            rawTaskConfig: taskConfig,
            resolver: taskResolver,
            moduleRunner,
        };
        moduleRunner.initialize();
        try {
            if (this.adapter.initialize) {
                await this.adapter.initialize(resolvedContext);
            }
            let result;
            if (this.adapter.execute) {
                result = await this.adapter.execute();
            }
            else if (this.adapter.launch) {
                // Fallback for legacy adapters
                result = await this.adapter.launch(resolvedContext);
            }
            else {
                throw new Error(`Task adapter for ${this.adapter.manifest.taskId} does not have an execute or launch method.`);
            }
            return result;
        }
        finally {
            moduleRunner.terminate();
            if (this.adapter.terminate) {
                await this.adapter.terminate();
            }
        }
    }
}
//# sourceMappingURL=taskAdapter.js.map