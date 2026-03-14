import { escapeHtml, pushJsPsychContinueScreen } from "./ui";
import { buildInstructionScreens, renderInstructionScreenHtml, renderTaskIntroCardHtml, renderBlockIntroCardHtml, } from "./instructionFlow";
export function appendJsPsychContinuePages(args) {
    const { timeline, plugin, container, pages, phase, buttonIdPrefix, html = (page) => `<p>${escapeHtml(page)}</p>`, data = (index) => ({ pageIndex: index }), } = args;
    for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index] ?? "";
        pushJsPsychContinueScreen(timeline, plugin, container, html(page, index), phase, `${buttonIdPrefix}-${index}`, data(index));
    }
}
export function appendJsPsychInstructionScreens(args) {
    const screens = buildInstructionScreens({
        pages: args.pages,
        section: args.section,
        title: args.title,
        blockLabel: args.blockLabel,
        buttonIdPrefix: args.buttonIdPrefix,
    });
    for (const screen of screens) {
        const ctx = screen.ctx;
        pushJsPsychContinueScreen(args.timeline, args.plugin, args.container, args.renderHtml ? args.renderHtml(ctx) : renderInstructionScreenHtml(ctx), args.phase ?? ctx.section, screen.buttonId, args.data ? args.data(ctx) : { pageIndex: ctx.pageIndex });
    }
}
export function appendJsPsychTaskIntroScreen(args) {
    pushJsPsychContinueScreen(args.timeline, args.plugin, args.container, renderTaskIntroCardHtml({ title: args.title, participantId: args.participantId }), args.phase ?? "intro_start", args.buttonId ?? "continue-intro-start", args.data);
}
export function appendJsPsychBlockIntroScreen(args) {
    pushJsPsychContinueScreen(args.timeline, args.plugin, args.container, renderBlockIntroCardHtml({
        blockLabel: args.blockLabel,
        introText: args.introText,
        showBlockLabel: args.showBlockLabel,
    }), args.phase ?? "block_start", args.buttonId ?? "continue-block-start", args.data);
}
//# sourceMappingURL=jspsychContinueFlow.js.map