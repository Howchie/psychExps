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

export function renderInstructionScreenHtml(ctx: InstructionScreenRenderContext): string {
  const headerText = ctx.blockLabel || ctx.title;
  if (!headerText) return `<p>${escapeHtml(ctx.pageText)}</p>`;
  return `<h3>${escapeHtml(headerText)}</h3><p>${escapeHtml(ctx.pageText)}</p>`;
}

export interface BuiltInstructionScreen {
  ctx: InstructionScreenRenderContext;
  buttonId: string;
}

export interface TaskIntroCardArgs {
  title: string;
  participantId?: string | null;
}

export function renderTaskIntroCardHtml(args: TaskIntroCardArgs): string {
  const participantHtml = args.participantId
    ? `<p>Participant: <code>${escapeHtml(args.participantId)}</code></p>`
    : "";
  return `<h2>${escapeHtml(args.title)}</h2>${participantHtml}`;
}

export interface BlockIntroCardArgs {
  blockLabel: string;
  introText?: string | null;
}

export function renderBlockIntroCardHtml(args: BlockIntroCardArgs): string {
  const introText = args.introText ?? "";
  return `<h3>${escapeHtml(args.blockLabel)}</h3><p>${escapeHtml(introText || "Press continue when ready.")}</p>`;
}

export function buildInstructionScreens(args: {
  pages: string[];
  section: keyof InstructionFlowPages;
  title?: string | null;
  blockLabel?: string | null;
  buttonIdPrefix: string;
}): BuiltInstructionScreen[] {
  const screens: BuiltInstructionScreen[] = [];
  for (let pageIndex = 0; pageIndex < args.pages.length; pageIndex += 1) {
    const pageText = args.pages[pageIndex] ?? "";
    const ctx: InstructionScreenRenderContext = {
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

export async function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void> {
  const screens = buildInstructionScreens({
    pages: args.pages,
    section: args.section,
    title: args.title,
    blockLabel: args.blockLabel,
    buttonIdPrefix: args.buttonIdPrefix,
  });
  for (const screen of screens) {
    await waitForContinue(
      args.container,
      args.renderHtml ? args.renderHtml(screen.ctx) : renderInstructionScreenHtml(screen.ctx),
      { buttonId: screen.buttonId },
    );
  }
}
