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
            let blockAttempt = 0;
            while (true) {
                const trialResults = [];
                await hooks?.onBlockStart?.({ block, blockIndex, blockAttempt });
                await emitHookEvent(hooks, { type: "block_start", blockIndex, blockAttempt });
                const trials = await args.getTrials({ block, blockIndex });
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
                if (!shouldRepeat)
                    break;
                await emitHookEvent(hooks, { type: "block_repeat", blockIndex, blockAttempt });
                blockAttempt += 1;
            }
        }
    }
    finally {
        await hooks?.onTaskEnd?.();
        await emitHookEvent(hooks, { type: "task_end" });
    }
    return { blocks: blockResults };
}
//# sourceMappingURL=sessionRunner.js.map