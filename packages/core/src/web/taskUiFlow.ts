import { escapeHtml, waitForContinue } from "./ui";
import { runInstructionScreens, renderTaskIntroCardHtml, renderBlockIntroCardHtml } from "./instructionFlow";
import type { InstructionScreenSpec } from "../utils/coerce";

type InstructionPage = string | InstructionScreenSpec;

export interface RunTaskIntroFlowArgs {
  container: HTMLElement;
  title: string;
  participantId?: string | null;
  showTaskTitleCard?: boolean;
  beforeIntroPages?: InstructionPage[][];
  introPages: InstructionPage[];
  afterIntroPages?: InstructionPage[][];
  buttonIdPrefix: string;
  renderHtml?: (ctx: {
    pageText: string;
    pageHtml?: string;
    pageTitle?: string;
    pageActions?: Array<{ id?: string; label: string; action?: "continue" | "exit" }>;
    pageIndex: number;
    section: string;
  }) => string;
}

export async function runTaskIntroFlow(args: RunTaskIntroFlowArgs): Promise<void> {
  for (let idx = 0; idx < (args.beforeIntroPages ?? []).length; idx += 1) {
    const pages = args.beforeIntroPages?.[idx] ?? [];
    await runInstructionScreens({
      container: args.container,
      pages,
      section: `taskIntroBefore_${idx}`,
      title: args.title,
      buttonIdPrefix: `${args.buttonIdPrefix}-intro-before-${idx}`,
      renderHtml: args.renderHtml,
    });
  }
  if (args.showTaskTitleCard !== false) {
    await waitForContinue(
      args.container,
      renderTaskIntroCardHtml({ title: args.title, participantId: args.participantId }),
      { buttonId: `${args.buttonIdPrefix}-intro-start` },
    );
  }

  await runInstructionScreens({
    container: args.container,
    pages: args.introPages,
    section: "intro",
    title: args.title,
    buttonIdPrefix: args.buttonIdPrefix,
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
      renderHtml: args.renderHtml,
    });
  }
}

export interface RunBlockUiFlowArgs {
  container: HTMLElement;
  blockLabel: string;
  blockIndex: number;
  buttonIdPrefix: string;
  introText?: string | null;
  showBlockLabel?: boolean;
  preBlockBeforeIntro?: boolean;
  preBlockPages?: InstructionPage[];
  beforeIntroInsertions?: InstructionPage[][];
  afterIntroInsertions?: InstructionPage[][];
  afterPreInsertions?: InstructionPage[][];
  postBlockPages?: InstructionPage[];
  beforePostInsertions?: InstructionPage[][];
  afterPostInsertions?: InstructionPage[][];
  renderHtml?: (ctx: {
    pageText: string;
    pageHtml?: string;
    pageTitle?: string;
    pageActions?: Array<{ id?: string; label: string; action?: "continue" | "exit" }>;
    pageIndex: number;
    section: string;
    blockLabel?: string | null;
  }) => string;
}

export async function runBlockStartFlow(args: RunBlockUiFlowArgs): Promise<void> {
  const blockLabel = args.showBlockLabel === false ? null : args.blockLabel;
  const runInsertionGroups = async (groups: InstructionPage[][] | undefined, sectionPrefix: string): Promise<void> => {
    for (let idx = 0; idx < (groups ?? []).length; idx += 1) {
      const pages = groups?.[idx] ?? [];
      await runInstructionScreens({
        container: args.container,
        pages,
        section: `${sectionPrefix}_${idx}`,
        blockLabel,
        buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}-${sectionPrefix}-${idx}`,
        renderHtml: args.renderHtml,
      });
    }
  };
  const runIntroCard = async (): Promise<void> => {
    await waitForContinue(
      args.container,
      renderBlockIntroCardHtml({
        blockLabel: args.blockLabel,
        introText: args.introText,
        showBlockLabel: args.showBlockLabel,
      }),
      { buttonId: `${args.buttonIdPrefix}-block-start-${args.blockIndex}` },
    );
  };
  const runPreScreens = async (): Promise<void> => {
    await runInstructionScreens({
      container: args.container,
      pages: args.preBlockPages ?? [],
      section: "preBlock",
      blockLabel,
      buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
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

export async function runBlockEndFlow(args: RunBlockUiFlowArgs): Promise<void> {
  const blockLabel = args.showBlockLabel === false ? null : args.blockLabel;
  const runInsertionGroups = async (groups: InstructionPage[][] | undefined, sectionPrefix: string): Promise<void> => {
    for (let idx = 0; idx < (groups ?? []).length; idx += 1) {
      const pages = groups?.[idx] ?? [];
      await runInstructionScreens({
        container: args.container,
        pages,
        section: `${sectionPrefix}_${idx}`,
        blockLabel,
        buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}-${sectionPrefix}-${idx}`,
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
    renderHtml: args.renderHtml,
  });
  await runInsertionGroups(args.afterPostInsertions, "blockEndAfterPost");
}

export interface RunTaskEndFlowArgs {
  container: HTMLElement;
  beforeEndPages?: InstructionPage[][];
  endPages: InstructionPage[];
  afterEndPages?: InstructionPage[][];
  buttonIdPrefix: string;
  completeTitle?: string;
  completeMessage?: string;
  doneButtonLabel?: string;
  renderHtml?: (ctx: {
    pageText: string;
    pageHtml?: string;
    pageTitle?: string;
    pageActions?: Array<{ id?: string; label: string; action?: "continue" | "exit" }>;
    pageIndex: number;
    section: string;
  }) => string;
}

export async function runTaskEndFlow(args: RunTaskEndFlowArgs): Promise<void> {
  for (let idx = 0; idx < (args.beforeEndPages ?? []).length; idx += 1) {
    const pages = args.beforeEndPages?.[idx] ?? [];
    await runInstructionScreens({
      container: args.container,
      pages,
      section: `taskEndBefore_${idx}`,
      title: args.completeTitle ?? "Complete",
      buttonIdPrefix: `${args.buttonIdPrefix}-end-before-${idx}`,
      renderHtml: args.renderHtml,
    });
  }
  await runInstructionScreens({
    container: args.container,
    pages: args.endPages,
    section: "end",
    title: args.completeTitle ?? "Complete",
    buttonIdPrefix: args.buttonIdPrefix,
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
      renderHtml: args.renderHtml,
    });
  }

  await waitForContinue(
    args.container,
    `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(args.completeMessage ?? "Task complete. You can close this tab.")}</p>`,
    {
      buttonId: `${args.buttonIdPrefix}-complete`,
      buttonLabel: args.doneButtonLabel ?? "Done",
    },
  );
}
