import { ConfigurationManager } from "../infrastructure/config";
import { createEventLogger } from "../infrastructure/events";
import { createVariableResolver } from "../infrastructure/variables";
import { TaskModuleRunner } from "./taskModule";
import { DrtModule } from "../engines/drt";
import { ProspectiveMemoryModule } from "../engines/prospectiveMemory";
import { StimulusInjectorModule } from "../engines/stimulusInjector";
/**
 * Builds a standard TaskAdapter without requiring per-task wrapper classes.
 * The returned adapter stores lifecycle context internally and executes `run(context)`.
 */
export function createTaskAdapter(options) {
    let context = null;
    return {
        manifest: options.manifest,
        async initialize(nextContext) {
            context = nextContext;
            if (options.initialize)
                await options.initialize(nextContext);
        },
        async execute() {
            if (!context) {
                throw new Error(`Task adapter for ${options.manifest.taskId} was not initialized.`);
            }
            return options.run(context);
        },
        async terminate() {
            if (!context)
                return;
            try {
                if (options.terminate)
                    await options.terminate(context);
            }
            finally {
                context = null;
            }
        },
    };
}
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
        // 1. High-level resolver: used for initial configuration resolution (e.g., basePaths, titles).
        // Specifically restricted to participant scope.
        const highLevelResolver = createVariableResolver({
            ...commonResolverArgs,
            allowedScopes: ["participant"],
        });
        // 2. Full resolver: for the task adapter to handle block and trial scopes
        const taskResolver = createVariableResolver(commonResolverArgs);
        // Resolve configuration metadata (static parts only)
        const configManager = new ConfigurationManager();
        configManager.validateLegacyKeys(taskConfig);
        const resolvedConfig = { ...taskConfig };
        for (const field of Object.keys(resolvedConfig)) {
            if (field === "variables" || field === "task")
                continue;
            resolvedConfig[field] = highLevelResolver.resolveInValue(resolvedConfig[field]);
        }
        // Initialize module runner with standard core modules
        const moduleRunner = new TaskModuleRunner([
            new DrtModule(),
            new ProspectiveMemoryModule(),
            new StimulusInjectorModule(),
        ]);
        const eventLogger = createEventLogger(context.selection);
        const resolvedContext = {
            ...context,
            taskConfig: resolvedConfig,
            rawTaskConfig: taskConfig,
            resolver: taskResolver,
            moduleRunner,
            eventLogger,
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
            // Centralized cursor restoration for all tasks
            if (typeof document !== "undefined") {
                document.documentElement.classList.remove("exp-cursor-hidden");
            }
        }
    }
}
//# sourceMappingURL=taskAdapter.js.map