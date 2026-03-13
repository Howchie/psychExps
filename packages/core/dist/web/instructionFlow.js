import { resolveInstructionPageSlots, toInstructionScreenSpecs, toStringScreens } from "../utils/coerce";
import { escapeHtml, waitForContinue, waitForContinueChoice } from "./ui";
export class InstructionFlowExitRequestedError extends Error {
    constructor(message = "Instruction flow requested exit") {
        super(message);
        this.name = "InstructionFlowExitRequestedError";
    }
}
export function isInstructionFlowExitRequestedError(value) {
    return value instanceof InstructionFlowExitRequestedError;
}
export function resolveInstructionFlowPages(config) {
    const resolved = resolveInstructionPageSlots(config.instructions, config.defaults);
    return {
        intro: toStringScreens(resolved.intro),
        preBlock: toStringScreens(resolved.preBlock),
        postBlock: toStringScreens(resolved.postBlock),
        end: toStringScreens(resolved.end),
    };
}
export function renderInstructionScreenHtml(ctx) {
    const headerText = ctx.pageTitle ?? ctx.blockLabel ?? ctx.title;
    if (ctx.pageHtml) {
        if (!headerText)
            return ctx.pageHtml;
        return `<h3>${escapeHtml(headerText)}</h3>${ctx.pageHtml}`;
    }
    if (!headerText)
        return `<p>${escapeHtml(ctx.pageText)}</p>`;
    return `<h3>${escapeHtml(headerText)}</h3><p>${escapeHtml(ctx.pageText)}</p>`;
}
export function renderTaskIntroCardHtml(args) {
    const participantHtml = args.participantId
        ? `<p>Participant: <code>${escapeHtml(args.participantId)}</code></p>`
        : "";
    return `<h2>${escapeHtml(args.title)}</h2>${participantHtml}`;
}
export function renderBlockIntroCardHtml(args) {
    const introText = args.introText ?? "";
    const showBlockLabel = args.showBlockLabel !== false;
    const titleHtml = showBlockLabel ? `<h3>${escapeHtml(args.blockLabel)}</h3>` : "";
    return `${titleHtml}<p>${escapeHtml(introText || "Press continue when ready.")}</p>`;
}
export function buildInstructionScreens(args) {
    const pages = toInstructionScreenSpecs(args.pages);
    const screens = [];
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const page = pages[pageIndex] ?? {};
        const pageText = page.text ?? "";
        const ctx = {
            title: args.title ?? null,
            pageText,
            ...(page.html ? { pageHtml: page.html } : {}),
            ...(page.title ? { pageTitle: page.title } : {}),
            ...(page.actions ? { pageActions: page.actions } : {}),
            section: args.section,
            pageIndex,
            blockLabel: args.blockLabel ?? null,
        };
        screens.push({
            ctx,
            buttonId: `${args.buttonIdPrefix}-${args.section}-${pageIndex}`,
        });
    }
    return screens;
}
export async function runInstructionScreens(args) {
    const screens = buildInstructionScreens({
        pages: args.pages,
        section: args.section,
        title: args.title,
        blockLabel: args.blockLabel,
        buttonIdPrefix: args.buttonIdPrefix,
    });
    for (const screen of screens) {
        const html = args.renderHtml ? args.renderHtml(screen.ctx) : renderInstructionScreenHtml(screen.ctx);
        const actions = screen.ctx.pageActions ?? [];
        if (actions.length === 0) {
            await waitForContinue(args.container, html, {
                buttonId: screen.buttonId,
                buttonStyle: args.continueButtonStyle,
                autoFocusButton: args.autoFocusContinueButton,
            });
            continue;
        }
        const buttons = actions.map((action, index) => ({
            id: `${screen.buttonId}-action-${action.id ?? index + 1}`,
            label: action.label,
            action: action.action === "exit" ? "exit" : "continue",
        }));
        const selected = await waitForContinueChoice(args.container, html, {
            buttons,
            buttonStyle: args.continueButtonStyle,
            autoFocusFirstButton: args.autoFocusContinueButton,
        });
        if (selected.action === "exit") {
            throw new InstructionFlowExitRequestedError();
        }
    }
}
//# sourceMappingURL=instructionFlow.js.map