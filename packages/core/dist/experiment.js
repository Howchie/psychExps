import { setCursorHidden, waitForContinue } from "./ui";
export async function runPromptScreens(container, screens) {
    for (const screen of screens) {
        await waitForContinue(container, screen.html, {
            buttonId: screen.buttonId,
            buttonLabel: screen.buttonLabel,
        });
    }
}
export async function runBlockTrialLoop(args) {
    const blockResults = [];
    for (let blockIndex = 0; blockIndex < args.blocks.length; blockIndex += 1) {
        const block = args.blocks[blockIndex];
        const trialResults = [];
        const blockCtx = { block, blockIndex, trialResults };
        const startHtml = args.renderBlockStart?.(blockCtx);
        if (startHtml) {
            await waitForContinue(args.container, startHtml, {
                buttonId: args.blockStartButtonId?.(blockCtx),
            });
        }
        const trials = args.getTrials ? args.getTrials(block) : (block.trials ?? []);
        for (let trialIndex = 0; trialIndex < trials.length; trialIndex += 1) {
            const trial = trials[trialIndex];
            const trialCtx = {
                block,
                blockIndex,
                trial,
                trialIndex,
                container: args.container,
                blockTrialResults: trialResults,
            };
            const shouldHideCursor = typeof args.hideCursorDuringTrial === "function"
                ? args.hideCursorDuringTrial(trialCtx)
                : args.hideCursorDuringTrial !== false;
            setCursorHidden(shouldHideCursor);
            try {
                const trialResult = await args.runTrial(trialCtx);
                trialResults.push(trialResult);
            }
            finally {
                setCursorHidden(false);
            }
        }
        const endHtml = args.renderBlockEnd?.(blockCtx);
        if (endHtml) {
            await waitForContinue(args.container, endHtml, {
                buttonId: args.blockEndButtonId?.(blockCtx),
            });
        }
        blockResults.push({ block, blockIndex, trialResults });
    }
    return { blocks: blockResults };
}
//# sourceMappingURL=experiment.js.map