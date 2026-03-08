import { escapeHtml, waitForContinue } from "./ui";
import { runInstructionScreens, renderTaskIntroCardHtml, renderBlockIntroCardHtml } from "./instructionFlow";
export async function runTaskIntroFlow(args) {
    await waitForContinue(args.container, renderTaskIntroCardHtml({ title: args.title, participantId: args.participantId }), { buttonId: `${args.buttonIdPrefix}-intro-start` });
    await runInstructionScreens({
        container: args.container,
        pages: args.introPages,
        section: "intro",
        title: args.title,
        buttonIdPrefix: args.buttonIdPrefix,
    });
}
export async function runBlockStartFlow(args) {
    await waitForContinue(args.container, renderBlockIntroCardHtml({ blockLabel: args.blockLabel, introText: args.introText }), { buttonId: `${args.buttonIdPrefix}-block-start-${args.blockIndex}` });
    await runInstructionScreens({
        container: args.container,
        pages: args.preBlockPages ?? [],
        section: "preBlock",
        blockLabel: args.blockLabel,
        buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
    });
}
export async function runBlockEndFlow(args) {
    await runInstructionScreens({
        container: args.container,
        pages: args.postBlockPages ?? [],
        section: "postBlock",
        blockLabel: args.blockLabel,
        buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
    });
}
export async function runTaskEndFlow(args) {
    await runInstructionScreens({
        container: args.container,
        pages: args.endPages,
        section: "end",
        title: args.completeTitle ?? "Complete",
        buttonIdPrefix: args.buttonIdPrefix,
        renderHtml: (ctx) => `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(ctx.pageText)}</p>`,
    });
    await waitForContinue(args.container, `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(args.completeMessage ?? "Task complete. You can close this tab.")}</p>`, {
        buttonId: `${args.buttonIdPrefix}-complete`,
        buttonLabel: args.doneButtonLabel ?? "Done",
    });
}
//# sourceMappingURL=taskUiFlow.js.map