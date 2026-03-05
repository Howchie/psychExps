import { resolveInstructionPageSlots, toStringScreens } from "../utils/coerce";
import { escapeHtml, waitForContinue } from "./ui";

export interface InstructionFlowPages {
  intro: string[];
  preBlock: string[];
  postBlock: string[];
  end: string[];
}

export interface InstructionFlowConfig {
  title?: string | null;
  instructions?: unknown;
  defaults?: Partial<InstructionFlowPages>;
}

export interface InstructionScreenRenderContext {
  title: string | null;
  pageText: string;
  section: keyof InstructionFlowPages;
  pageIndex: number;
  blockLabel?: string | null;
}

export interface RunInstructionScreensArgs {
  container: HTMLElement;
  pages: string[];
  section: keyof InstructionFlowPages;
  title?: string | null;
  blockLabel?: string | null;
  buttonIdPrefix: string;
  renderHtml?: (ctx: InstructionScreenRenderContext) => string;
}

export function resolveInstructionFlowPages(config: InstructionFlowConfig): InstructionFlowPages {
  const resolved = resolveInstructionPageSlots(config.instructions, config.defaults);
  return {
    intro: toStringScreens(resolved.intro),
    preBlock: toStringScreens(resolved.preBlock),
    postBlock: toStringScreens(resolved.postBlock),
    end: toStringScreens(resolved.end),
  };
}

function defaultInstructionHtml(ctx: InstructionScreenRenderContext): string {
  const headerText = ctx.blockLabel || ctx.title;
  if (!headerText) return `<p>${escapeHtml(ctx.pageText)}</p>`;
  return `<h3>${escapeHtml(headerText)}</h3><p>${escapeHtml(ctx.pageText)}</p>`;
}

export async function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void> {
  for (let pageIndex = 0; pageIndex < args.pages.length; pageIndex += 1) {
    const pageText = args.pages[pageIndex] ?? "";
    const renderCtx: InstructionScreenRenderContext = {
      title: args.title ?? null,
      pageText,
      section: args.section,
      pageIndex,
      blockLabel: args.blockLabel ?? null,
    };
    await waitForContinue(
      args.container,
      args.renderHtml ? args.renderHtml(renderCtx) : defaultInstructionHtml(renderCtx),
      { buttonId: `${args.buttonIdPrefix}-${args.section}-${pageIndex}` },
    );
  }
}
