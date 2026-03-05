import { resolveInstructionPageSlots, toStringScreens } from "./coerce";
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
function defaultInstructionHtml(ctx) {
    const headerText = ctx.blockLabel || ctx.title;
    if (!headerText)
        return `<p>${escapeHtml(ctx.pageText)}</p>`;
    return `<h3>${escapeHtml(headerText)}</h3><p>${escapeHtml(ctx.pageText)}</p>`;
}
export async function runInstructionScreens(args) {
    for (let pageIndex = 0; pageIndex < args.pages.length; pageIndex += 1) {
        const pageText = args.pages[pageIndex] ?? "";
        const renderCtx = {
            title: args.title ?? null,
            pageText,
            section: args.section,
            pageIndex,
            blockLabel: args.blockLabel ?? null,
        };
        await waitForContinue(args.container, args.renderHtml ? args.renderHtml(renderCtx) : defaultInstructionHtml(renderCtx), { buttonId: `${args.buttonIdPrefix}-${args.section}-${pageIndex}` });
    }
}
//# sourceMappingURL=instructionFlow.js.map