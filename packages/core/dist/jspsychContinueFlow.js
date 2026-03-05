import { escapeHtml, pushJsPsychContinueScreen } from "./ui";
export function appendJsPsychContinuePages(args) {
    const { timeline, plugin, container, pages, phase, buttonIdPrefix, html = (page) => `<p>${escapeHtml(page)}</p>`, data = (index) => ({ pageIndex: index }), } = args;
    for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index] ?? "";
        pushJsPsychContinueScreen(timeline, plugin, container, html(page, index), phase, `${buttonIdPrefix}-${index}`, data(index));
    }
}
//# sourceMappingURL=jspsychContinueFlow.js.map