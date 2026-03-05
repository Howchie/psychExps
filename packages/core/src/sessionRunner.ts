export type TaskSessionScope = "task" | "block" | "trial";

export interface TaskSessionScopeContext<TBlock = unknown, TTrial = unknown> {
  scope: TaskSessionScope;
  block?: TBlock;
  blockIndex?: number;
  trial?: TTrial;
  trialIndex?: number;
}

export interface TaskSessionEvent<TPayload = Record<string, unknown>> {
  type: string;
  payload?: TPayload;
  blockIndex?: number;
  trialIndex?: number;
}

export interface TaskSessionRunnerHooks<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> {
  onTaskStart?: () => Promise<void> | void;
  onTaskEnd?: () => Promise<void> | void;
  onBlockStart?: (ctx: { block: TBlock; blockIndex: number }) => Promise<void> | void;
  onBlockEnd?: (ctx: { block: TBlock; blockIndex: number; trialResults: TTrialResult[] }) => Promise<void> | void;
  onTrialStart?: (ctx: { block: TBlock; blockIndex: number; trial: TTrial; trialIndex: number }) => Promise<void> | void;
  onTrialEnd?: (
    ctx: {
      block: TBlock;
      blockIndex: number;
      trial: TTrial;
      trialIndex: number;
      result: TTrialResult;
    },
  ) => Promise<void> | void;
  onEvent?: (event: TaskSessionEvent) => Promise<void> | void;
}

export interface TaskSessionRunnerArgs<TBlock, TTrial, TTrialResult> {
  blocks: TBlock[];
  getTrials: (ctx: { block: TBlock; blockIndex: number }) => TTrial[] | Promise<TTrial[]>;
  runTrial: (
    ctx: { block: TBlock; blockIndex: number; trial: TTrial; trialIndex: number; blockTrialResults: TTrialResult[] },
  ) => Promise<TTrialResult>;
  hooks?: TaskSessionRunnerHooks<TBlock, TTrial, TTrialResult>;
}

export interface TaskSessionRunnerBlockResult<TBlock, TTrialResult> {
  block: TBlock;
  blockIndex: number;
  trialResults: TTrialResult[];
}

export interface TaskSessionRunnerResult<TBlock, TTrialResult> {
  blocks: Array<TaskSessionRunnerBlockResult<TBlock, TTrialResult>>;
}

async function emitHookEvent<TBlock, TTrial, TTrialResult>(
  hooks: TaskSessionRunnerHooks<TBlock, TTrial, TTrialResult> | undefined,
  event: TaskSessionEvent,
): Promise<void> {
  if (!hooks?.onEvent) return;
  await hooks.onEvent(event);
}

/**
 * Generic async task/session runner:
 * - task start/end lifecycle
 * - block start/end lifecycle
 * - trial start/end lifecycle
 *
 * This runner is intentionally renderer-agnostic and timeline-agnostic.
 */
export async function runTaskSession<TBlock, TTrial, TTrialResult>(
  args: TaskSessionRunnerArgs<TBlock, TTrial, TTrialResult>,
): Promise<TaskSessionRunnerResult<TBlock, TTrialResult>> {
  const hooks = args.hooks;
  const blockResults: Array<TaskSessionRunnerBlockResult<TBlock, TTrialResult>> = [];

  await hooks?.onTaskStart?.();
  await emitHookEvent(hooks, { type: "task_start" });
  try {
    for (let blockIndex = 0; blockIndex < args.blocks.length; blockIndex += 1) {
      const block = args.blocks[blockIndex];
      const trialResults: TTrialResult[] = [];
      await hooks?.onBlockStart?.({ block, blockIndex });
      await emitHookEvent(hooks, { type: "block_start", blockIndex });

      const trials = await args.getTrials({ block, blockIndex });
      for (let trialIndex = 0; trialIndex < trials.length; trialIndex += 1) {
        const trial = trials[trialIndex];
        await hooks?.onTrialStart?.({ block, blockIndex, trial, trialIndex });
        await emitHookEvent(hooks, { type: "trial_start", blockIndex, trialIndex });
        const result = await args.runTrial({
          block,
          blockIndex,
          trial,
          trialIndex,
          blockTrialResults: trialResults,
        });
        trialResults.push(result);
        await hooks?.onTrialEnd?.({ block, blockIndex, trial, trialIndex, result });
        await emitHookEvent(hooks, { type: "trial_end", blockIndex, trialIndex });
      }

      await hooks?.onBlockEnd?.({ block, blockIndex, trialResults });
      await emitHookEvent(hooks, { type: "block_end", blockIndex });
      blockResults.push({ block, blockIndex, trialResults });
    }
  } finally {
    await hooks?.onTaskEnd?.();
    await emitHookEvent(hooks, { type: "task_end" });
  }

  return { blocks: blockResults };
}
