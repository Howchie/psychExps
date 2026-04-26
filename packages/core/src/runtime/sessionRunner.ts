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
  blockAttempt?: number;
  trialIndex?: number;
}

export interface TaskSessionRunnerHooks<TBlock = unknown, TTrial = unknown, TTrialResult = unknown> {
  onTaskStart?: () => Promise<void> | void;
  onTaskEnd?: () => Promise<void> | void;
  onBlockStart?: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number }) => Promise<void> | void;
  onBlockEnd?: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number; trialResults: TTrialResult[] }) => Promise<void> | void;
  onTrialStart?: (
    ctx: { block: TBlock; blockIndex: number; blockAttempt?: number; trial: TTrial; trialIndex: number },
  ) => Promise<void> | void;
  onTrialEnd?: (
    ctx: {
      block: TBlock;
      blockIndex: number;
      blockAttempt?: number;
      trial: TTrial;
      trialIndex: number;
      result: TTrialResult;
    },
  ) => Promise<void> | void;
  onEvent?: (event: TaskSessionEvent) => Promise<void> | void;
}

export interface TaskSessionRunnerArgs<TBlock, TTrial, TTrialResult> {
  blocks: TBlock[];
  getTrials: (ctx: { block: TBlock; blockIndex: number; blockAttempt?: number }) => TTrial[] | Promise<TTrial[]>;
  runTrial: (
    ctx: {
      block: TBlock;
      blockIndex: number;
      blockAttempt?: number;
      trial: TTrial;
      trialIndex: number;
      blockTrialResults: TTrialResult[];
    },
  ) => Promise<TTrialResult>;
  shouldRepeatBlock?: (
    ctx: { block: TBlock; blockIndex: number; blockAttempt: number; trialResults: TTrialResult[] },
  ) => boolean | Promise<boolean>;
  hooks?: TaskSessionRunnerHooks<TBlock, TTrial, TTrialResult>;
}

export interface TaskSessionRunnerBlockResult<TBlock, TTrialResult> {
  block: TBlock;
  blockIndex: number;
  blockAttempt?: number;
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
      let blockAttempt = 0;
      while (true) {
        const trialResults: TTrialResult[] = [];
        await hooks?.onBlockStart?.({ block, blockIndex, blockAttempt });
        await emitHookEvent(hooks, { type: "block_start", blockIndex, blockAttempt });

        const trials = await args.getTrials({ block, blockIndex, blockAttempt });
        for (let trialIndex = 0; trialIndex < trials.length; trialIndex += 1) {
          const trial = trials[trialIndex];
          await hooks?.onTrialStart?.({ block, blockIndex, blockAttempt, trial, trialIndex });
          await emitHookEvent(hooks, { type: "trial_start", blockIndex, blockAttempt, trialIndex });
          const result = await args.runTrial({
            block,
            blockIndex,
            blockAttempt,
            trial,
            trialIndex,
            blockTrialResults: trialResults,
          });
          trialResults.push(result);
          await hooks?.onTrialEnd?.({ block, blockIndex, blockAttempt, trial, trialIndex, result });
          await emitHookEvent(hooks, { type: "trial_end", blockIndex, blockAttempt, trialIndex });
        }

        await hooks?.onBlockEnd?.({ block, blockIndex, blockAttempt, trialResults });
        await emitHookEvent(hooks, { type: "block_end", blockIndex, blockAttempt });
        blockResults.push({ block, blockIndex, blockAttempt, trialResults });

        const shouldRepeat = args.shouldRepeatBlock
          ? await args.shouldRepeatBlock({ block, blockIndex, blockAttempt, trialResults })
          : false;
        if (!shouldRepeat) break;
        await emitHookEvent(hooks, { type: "block_repeat", blockIndex, blockAttempt });
        blockAttempt += 1;
      }
    }
  } finally {
    await hooks?.onTaskEnd?.();
    await emitHookEvent(hooks, { type: "task_end" });
  }

  return { blocks: blockResults };
}
