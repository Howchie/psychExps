import { ConfigurationManager } from "../infrastructure/config";
import { createVariableResolver } from "../infrastructure/variables";
import type { TaskManifest, TaskAdapterContext, JSONObject } from "./types";

/**
 * A standardized interface for a task adapter.
 */
export interface TaskAdapter {
  /**
   * Returns metadata about the task and its variants.
   */
  readonly manifest: TaskManifest;

  /**
   * Called to set up the task before execution (e.g., parse configuration, initialize resources).
   */
  initialize?(context: TaskAdapterContext): Promise<void>;

  /**
   * Called to execute the main task logic.
   * Returns the final data or results from the task run.
   */
  execute?(): Promise<unknown>;

  /**
   * Called after execution, even if it failed, to clean up resources (e.g., stop timers, clear global listeners).
   */
  terminate?(): Promise<void>;

  /**
   * LEGACY: The old launch method. Will be removed once all tasks are migrated.
   */
  launch?(context: TaskAdapterContext): Promise<void>;
}

/**
 * Manages the full lifecycle of a task adapter.
 */
export class LifecycleManager {
  constructor(private adapter: TaskAdapter) {}

  /**
   * Executes the full task lifecycle: initialize, execute, terminate.
   * If the adapter only has the legacy 'launch' method, it will use that.
   */
  async run(context: TaskAdapterContext): Promise<unknown> {
    // Standardize VariableResolver instantiation using SelectionContext
    const taskConfig = context.taskConfig ?? {};
    const taskVariables = (taskConfig.task as JSONObject)?.variables as JSONObject;
    const topVariables = taskConfig.variables as JSONObject;
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
    const resolvedConfig = configManager.resolve(taskConfig, highLevelResolver);

    const resolvedContext: TaskAdapterContext = {
      ...context,
      taskConfig: resolvedConfig,
      resolver: taskResolver,
    };

    try {
      if (this.adapter.initialize) {
        await this.adapter.initialize(resolvedContext);
      }
      
      let result: unknown;
      if (this.adapter.execute) {
        result = await this.adapter.execute();
      } else if (this.adapter.launch) {
        // Fallback for legacy adapters
        result = await this.adapter.launch(resolvedContext);
      } else {
        throw new Error(`Task adapter for ${this.adapter.manifest.taskId} does not have an execute or launch method.`);
      }
      
      return result;
    } finally {
      if (this.adapter.terminate) {
        await this.adapter.terminate();
      }
    }
  }
}
