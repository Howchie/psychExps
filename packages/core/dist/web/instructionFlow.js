import { resolveInstructionPageSlots, toStringScreens } from "../utils/coerce";
import { escapeHtml, waitForContinue } from "./ui";
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
    const headerText = ctx.blockLabel || ctx.title;
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
    return `<h3>${escapeHtml(args.blockLabel)}</h3><p>${escapeHtml(introText || "Press continue when ready.")}</p>`;
}
export function buildInstructionScreens(args) {
    const screens = [];
    for (let pageIndex = 0; pageIndex < args.pages.length; pageIndex += 1) {
        const pageText = args.pages[pageIndex] ?? "";
        const ctx = {
            title: args.title ?? null,
            pageText,
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
        await waitForContinue(args.container, args.renderHtml ? args.renderHtml(screen.ctx) : renderInstructionScreenHtml(screen.ctx), { buttonId: screen.buttonId });
    }
}
//# sourceMappingURL=instructionFlow.js.map