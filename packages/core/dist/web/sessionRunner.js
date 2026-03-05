async function emitHookEvent(hooks, event) {
    if (!hooks?.onEvent)
        return;
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
export async function runTaskSession(args) {
    const hooks = args.hooks;
    const blockResults = [];
    await hooks?.onTaskStart?.();
    await emitHookEvent(hooks, { type: "task_start" });
    try {
        for (let blockIndex = 0; blockIndex < args.blocks.length; blockIndex += 1) {
            const block = args.blocks[blockIndex];
            const trialResults = [];
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
    }
    finally {
        await hooks?.onTaskEnd?.();
        await emitHookEvent(hooks, { type: "task_end" });
    }
    return { blocks: blockResults };
}
//# sourceMappingURL=sessionRunner.js.map