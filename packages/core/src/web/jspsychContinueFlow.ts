import { escapeHtml, pushJsPsychContinueScreen } from "./ui";

export interface AppendJsPsychContinuePagesArgs {
  timeline: any[];
  plugin: unknown;
  container: HTMLElement;
  pages: string[];
  phase: string;
  buttonIdPrefix: string;
  html?: (page: string, index: number) => string;
  data?: (index: number) => Record<string, unknown>;
}

export function appendJsPsychContinuePages(args: AppendJsPsychContinuePagesArgs): void {
  const {
    timeline,
    plugin,
    container,
    pages,
    phase,
    buttonIdPrefix,
    html = (page) => `<p>${escapeHtml(page)}</p>`,
    data = (index) => ({ pageIndex: index }),
  } = args;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index] ?? "";
    pushJsPsychContinueScreen(
      timeline,
      plugin,
      container,
      html(page, index),
      phase,
      `${buttonIdPrefix}-${index}`,
      data(index),
    );
  }
}
