import { resolveInstructionPageSlots, toInstructionScreenSpecs, toStringScreens } from "../utils/coerce";
import { escapeHtml, waitForContinue, waitForContinueChoice, type ButtonStyleOverrides } from "./ui";

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
  pageHtml?: string;
  pageTitle?: string;
  pageActions?: Array<{ id?: string; label: string; action?: "continue" | "exit" }>;
  section: string;
  pageIndex: number;
  blockLabel?: string | null;
}

export class InstructionFlowExitRequestedError extends Error {
  constructor(message = "Instruction flow requested exit") {
    super(message);
    this.name = "InstructionFlowExitRequestedError";
  }
}

export function isInstructionFlowExitRequestedError(value: unknown): value is InstructionFlowExitRequestedError {
  return value instanceof InstructionFlowExitRequestedError;
}

export interface RunInstructionScreensArgs {
  container: HTMLElement;
  pages: unknown;
  section: string;
  title?: string | null;
  blockLabel?: string | null;
  buttonIdPrefix: string;
  continueButtonStyle?: ButtonStyleOverrides;
  autoFocusContinueButton?: boolean;
  cardWidth?: string;
  cardMinHeight?: string;
  cardBackground?: string;
  cardBorder?: string;
  cardBorderRadius?: string;
  cardColor?: string;
  cardFontSize?: string;
  cardFontFamily?: string;
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
  const headerText = ctx.pageTitle;
  if (ctx.pageHtml) {
    if (!headerText) return ctx.pageHtml;
    return `<h3>${escapeHtml(headerText)}</h3>${ctx.pageHtml}`;
  }
  if (!headerText) return `<p>${escapeHtml(ctx.pageText)}</p>`;
  return `<h3>${escapeHtml(headerText)}</h3><p>${escapeHtml(ctx.pageText)}</p>`;
}

export function renderSimpleInstructionScreenHtml(
  ctx: Omit<InstructionScreenRenderContext, "title"> & { title?: string | null },
  options: {
    showBlockLabel?: boolean;
    introAppendHtml?: string | ((ctx: Omit<InstructionScreenRenderContext, "title"> & { title?: string | null }) => string | null | undefined);
  } = {},
): string {
  const section = String(ctx.section ?? "");
  const blockLabel = options.showBlockLabel === false ? null : ctx.blockLabel;
  const base = renderInstructionScreenHtml({ ...ctx, title: ctx.title ?? null, blockLabel });
  if (!section.startsWith("intro")) return base;
  const append =
    typeof options.introAppendHtml === "function"
      ? options.introAppendHtml(ctx)
      : options.introAppendHtml;
  return append ? `${base}${append}` : base;
}

export type TaskInstructionRenderContext = Omit<InstructionScreenRenderContext, "title"> & { title?: string | null };

export interface CreateInstructionRendererOptions {
  showBlockLabel?: boolean;
  introAppendHtml?: string | ((ctx: TaskInstructionRenderContext) => string | null | undefined);
  summarySectionPattern?: RegExp;
  resolvePage?: (ctx: TaskInstructionRenderContext) => {
    pageText: string;
    pageHtml?: string;
    pageTitle?: string;
  };
}

export function createInstructionRenderer(options: CreateInstructionRendererOptions = {}) {
  return (ctx: TaskInstructionRenderContext): string => {
    const resolved = options.resolvePage ? options.resolvePage(ctx) : {
      pageText: ctx.pageText,
      ...(ctx.pageHtml ? { pageHtml: ctx.pageHtml } : {}),
      ...(ctx.pageTitle ? { pageTitle: ctx.pageTitle } : {}),
    };

    if (
      options.summarySectionPattern &&
      !resolved.pageHtml &&
      options.summarySectionPattern.test(String(ctx.section ?? ""))
    ) {
      const lines = resolved.pageText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length > 0) {
        const [titleLine, ...bodyLines] = lines;
        const blockLabelHtml =
          options.showBlockLabel !== false && ctx.blockLabel ? `<h3>${escapeHtml(ctx.blockLabel)}</h3>` : "";
        const bodyHtml = bodyLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
        return `${blockLabelHtml}<h2>${escapeHtml(titleLine)}</h2>${bodyHtml}`;
      }
    }

    return renderSimpleInstructionScreenHtml(
      {
        ...ctx,
        pageText: resolved.pageText,
        ...(resolved.pageHtml ? { pageHtml: resolved.pageHtml } : {}),
        ...(resolved.pageTitle ? { pageTitle: resolved.pageTitle } : {}),
      },
      {
        showBlockLabel: options.showBlockLabel,
        introAppendHtml: options.introAppendHtml,
      },
    );
  };
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
  showBlockLabel?: boolean;
  variables?: Record<string, unknown>;
}

export function renderBlockIntroCardHtml(args: BlockIntroCardArgs): string {
  let introText = args.introText ?? "Press continue when ready.";
  const showBlockLabel = args.showBlockLabel !== false;
  const titleHtml = showBlockLabel ? `<h3>${escapeHtml(args.blockLabel)}</h3>` : "";

  if (args.variables) {
    for (const [key, value] of Object.entries(args.variables)) {
      introText = introText.replaceAll(`{${key}}`, String(value));
    }
  }

  return `${titleHtml}<p>${escapeHtml(introText)}</p>`;
}

export function buildInstructionScreens(args: {
  pages: unknown;
  section: string;
  title?: string | null;
  blockLabel?: string | null;
  buttonIdPrefix: string;
}): BuiltInstructionScreen[] {
  const pages = toInstructionScreenSpecs(args.pages);
  const screens: BuiltInstructionScreen[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex] ?? {};
    const pageText = page.text ?? "";
    const ctx: InstructionScreenRenderContext = {
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

export async function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void> {
  const screens = buildInstructionScreens({
    pages: args.pages,
    section: args.section,
    title: args.title,
    blockLabel: args.blockLabel,
    buttonIdPrefix: args.buttonIdPrefix,
  });
  for (const screen of screens) {
    const html = args.renderHtml ? args.renderHtml(screen.ctx) : renderInstructionScreenHtml(screen.ctx);
    const htmlContent = !!screen.ctx.pageHtml;
    const actions = screen.ctx.pageActions ?? [];
    if (actions.length === 0) {
      await waitForContinue(args.container, html, {
        buttonId: screen.buttonId,
        buttonStyle: args.continueButtonStyle,
        autoFocusButton: args.autoFocusContinueButton,
        cardWidth: args.cardWidth,
        cardMinHeight: args.cardMinHeight,
        cardBackground: args.cardBackground,
        cardBorder: args.cardBorder,
        cardBorderRadius: args.cardBorderRadius,
        cardColor: args.cardColor,
        cardFontSize: args.cardFontSize,
        cardFontFamily: args.cardFontFamily,
        htmlContent,
      });
      continue;
    }
    const buttons = actions.map((action, index): { id: string; label: string; action: "continue" | "exit" } => ({
      id: `${screen.buttonId}-action-${action.id ?? index + 1}`,
      label: action.label,
      action: action.action === "exit" ? "exit" : "continue",
    }));
    const selected = await waitForContinueChoice(args.container, html, {
      buttons,
      buttonStyle: args.continueButtonStyle,
      autoFocusFirstButton: args.autoFocusContinueButton,
      cardWidth: args.cardWidth,
      cardMinHeight: args.cardMinHeight,
      cardBackground: args.cardBackground,
      cardBorder: args.cardBorder,
      cardColor: args.cardColor,
      cardFontSize: args.cardFontSize,
      cardFontFamily: args.cardFontFamily,
      htmlContent,
    });
    if (selected.action === "exit") {
      throw new InstructionFlowExitRequestedError();
    }
  }
}
