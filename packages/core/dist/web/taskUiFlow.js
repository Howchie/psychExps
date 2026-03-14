import { escapeHtml, waitForContinue } from "./ui";
import { runInstructionScreens, renderTaskIntroCardHtml, renderBlockIntroCardHtml } from "./instructionFlow";
export async function runTaskIntroFlow(args) {
    for (let idx = 0; idx < (args.beforeIntroPages ?? []).length; idx += 1) {
        const pages = args.beforeIntroPages?.[idx] ?? [];
        await runInstructionScreens({
            container: args.container,
            pages,
            section: `taskIntroBefore_${idx}`,
            title: args.title,
            buttonIdPrefix: `${args.buttonIdPrefix}-intro-before-${idx}`,
            continueButtonStyle: args.continueButtonStyle,
            autoFocusContinueButton: args.autoFocusContinueButton,
            renderHtml: args.renderHtml,
        });
    }
    if (args.showTaskTitleCard !== false) {
        await waitForContinue(args.container, renderTaskIntroCardHtml({ title: args.title, participantId: args.participantId }), {
            buttonId: `${args.buttonIdPrefix}-intro-start`,
            buttonStyle: args.continueButtonStyle,
            autoFocusButton: args.autoFocusContinueButton,
        });
    }
    await runInstructionScreens({
        container: args.container,
        pages: args.introPages,
        section: "intro",
        title: args.title,
        buttonIdPrefix: args.buttonIdPrefix,
        continueButtonStyle: args.continueButtonStyle,
        autoFocusContinueButton: args.autoFocusContinueButton,
        renderHtml: args.renderHtml,
    });
    for (let idx = 0; idx < (args.afterIntroPages ?? []).length; idx += 1) {
        const pages = args.afterIntroPages?.[idx] ?? [];
        await runInstructionScreens({
            container: args.container,
            pages,
            section: `taskIntroAfter_${idx}`,
            title: args.title,
            buttonIdPrefix: `${args.buttonIdPrefix}-intro-after-${idx}`,
            continueButtonStyle: args.continueButtonStyle,
            autoFocusContinueButton: args.autoFocusContinueButton,
            renderHtml: args.renderHtml,
        });
    }
}
export async function runBlockStartFlow(args) {
    const blockLabel = args.showBlockLabel === false ? null : args.blockLabel;
    const runInsertionGroups = async (groups, sectionPrefix) => {
        for (let idx = 0; idx < (groups ?? []).length; idx += 1) {
            const pages = groups?.[idx] ?? [];
            await runInstructionScreens({
                container: args.container,
                pages,
                section: `${sectionPrefix}_${idx}`,
                blockLabel,
                buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}-${sectionPrefix}-${idx}`,
                continueButtonStyle: args.continueButtonStyle,
                autoFocusContinueButton: args.autoFocusContinueButton,
                renderHtml: args.renderHtml,
            });
        }
    };
    const runIntroCard = async () => {
        await waitForContinue(args.container, renderBlockIntroCardHtml({
            blockLabel: args.blockLabel,
            introText: args.introText,
            showBlockLabel: args.showBlockLabel,
            variables: args.variables,
        }), {
            buttonId: `${args.buttonIdPrefix}-block-start-${args.blockIndex}`,
            buttonStyle: args.continueButtonStyle,
            autoFocusButton: args.autoFocusContinueButton,
        });
    };
    const runPreScreens = async () => {
        await runInstructionScreens({
            container: args.container,
            pages: args.preBlockPages ?? [],
            section: "preBlock",
            blockLabel,
            buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
            continueButtonStyle: args.continueButtonStyle,
            autoFocusContinueButton: args.autoFocusContinueButton,
            renderHtml: args.renderHtml,
        });
    };
    if (args.preBlockBeforeIntro) {
        await runInsertionGroups(args.beforeIntroInsertions, "blockStartBeforeIntro");
        await runPreScreens();
        await runInsertionGroups(args.afterPreInsertions, "blockStartAfterPre");
        await runIntroCard();
        await runInsertionGroups(args.afterIntroInsertions, "blockStartAfterIntro");
        return;
    }
    await runInsertionGroups(args.beforeIntroInsertions, "blockStartBeforeIntro");
    await runIntroCard();
    await runInsertionGroups(args.afterIntroInsertions, "blockStartAfterIntro");
    await runPreScreens();
    await runInsertionGroups(args.afterPreInsertions, "blockStartAfterPre");
}
export async function runBlockEndFlow(args) {
    const blockLabel = args.showBlockLabel === false ? null : args.blockLabel;
    const runInsertionGroups = async (groups, sectionPrefix) => {
        for (let idx = 0; idx < (groups ?? []).length; idx += 1) {
            const pages = groups?.[idx] ?? [];
            await runInstructionScreens({
                container: args.container,
                pages,
                section: `${sectionPrefix}_${idx}`,
                blockLabel,
                buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}-${sectionPrefix}-${idx}`,
                continueButtonStyle: args.continueButtonStyle,
                autoFocusContinueButton: args.autoFocusContinueButton,
                renderHtml: args.renderHtml,
            });
        }
    };
    await runInsertionGroups(args.beforePostInsertions, "blockEndBeforePost");
    await runInstructionScreens({
        container: args.container,
        pages: args.postBlockPages ?? [],
        section: "postBlock",
        blockLabel,
        buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
        continueButtonStyle: args.continueButtonStyle,
        autoFocusContinueButton: args.autoFocusContinueButton,
        renderHtml: args.renderHtml,
    });
    await runInsertionGroups(args.afterPostInsertions, "blockEndAfterPost");
}
export async function runTaskEndFlow(args) {
    for (let idx = 0; idx < (args.beforeEndPages ?? []).length; idx += 1) {
        const pages = args.beforeEndPages?.[idx] ?? [];
        await runInstructionScreens({
            container: args.container,
            pages,
            section: `taskEndBefore_${idx}`,
            title: args.completeTitle ?? "Complete",
            buttonIdPrefix: `${args.buttonIdPrefix}-end-before-${idx}`,
            continueButtonStyle: args.continueButtonStyle,
            autoFocusContinueButton: args.autoFocusContinueButton,
            renderHtml: args.renderHtml,
        });
    }
    await runInstructionScreens({
        container: args.container,
        pages: args.endPages,
        section: "end",
        title: args.completeTitle ?? "Complete",
        buttonIdPrefix: args.buttonIdPrefix,
        continueButtonStyle: args.continueButtonStyle,
        autoFocusContinueButton: args.autoFocusContinueButton,
        renderHtml: args.renderHtml ?? ((ctx) => `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(ctx.pageText)}</p>`),
    });
    for (let idx = 0; idx < (args.afterEndPages ?? []).length; idx += 1) {
        const pages = args.afterEndPages?.[idx] ?? [];
        await runInstructionScreens({
            container: args.container,
            pages,
            section: `taskEndAfter_${idx}`,
            title: args.completeTitle ?? "Complete",
            buttonIdPrefix: `${args.buttonIdPrefix}-end-after-${idx}`,
            continueButtonStyle: args.continueButtonStyle,
            autoFocusContinueButton: args.autoFocusContinueButton,
            renderHtml: args.renderHtml,
        });
    }
    await waitForContinue(args.container, `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(args.completeMessage ?? "Task complete. You can close this tab.")}</p>`, {
        buttonId: `${args.buttonIdPrefix}-complete`,
        buttonLabel: args.doneButtonLabel ?? "Done",
        buttonStyle: args.continueButtonStyle,
        autoFocusButton: args.autoFocusContinueButton,
    });
}
//# sourceMappingURL=taskUiFlow.js.map