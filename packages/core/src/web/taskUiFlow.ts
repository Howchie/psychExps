import { escapeHtml, waitForContinue } from "./ui";
import { runInstructionScreens } from "./instructionFlow";

export interface RunTaskIntroFlowArgs {
  container: HTMLElement;
  title: string;
  participantId?: string | null;
  introPages: string[];
  buttonIdPrefix: string;
}

export async function runTaskIntroFlow(args: RunTaskIntroFlowArgs): Promise<void> {
  const participantHtml = args.participantId
    ? `<p>Participant: <code>${escapeHtml(args.participantId)}</code></p>`
    : "";
  await waitForContinue(
    args.container,
    `<h2>${escapeHtml(args.title)}</h2>${participantHtml}`,
    { buttonId: `${args.buttonIdPrefix}-intro-start` },
  );

  await runInstructionScreens({
    container: args.container,
    pages: args.introPages,
    section: "intro",
    title: args.title,
    buttonIdPrefix: args.buttonIdPrefix,
  });
}

export interface RunBlockUiFlowArgs {
  container: HTMLElement;
  blockLabel: string;
  blockIndex: number;
  buttonIdPrefix: string;
  introText?: string | null;
  preBlockPages?: string[];
  postBlockPages?: string[];
}

export async function runBlockStartFlow(args: RunBlockUiFlowArgs): Promise<void> {
  const intro = args.introText ?? "";
  await waitForContinue(
    args.container,
    `<h3>${escapeHtml(args.blockLabel)}</h3><p>${escapeHtml(intro || "Press continue when ready.")}</p>`,
    { buttonId: `${args.buttonIdPrefix}-block-start-${args.blockIndex}` },
  );

  await runInstructionScreens({
    container: args.container,
    pages: args.preBlockPages ?? [],
    section: "preBlock",
    blockLabel: args.blockLabel,
    buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
  });
}

export async function runBlockEndFlow(args: RunBlockUiFlowArgs): Promise<void> {
  await runInstructionScreens({
    container: args.container,
    pages: args.postBlockPages ?? [],
    section: "postBlock",
    blockLabel: args.blockLabel,
    buttonIdPrefix: `${args.buttonIdPrefix}-block-${args.blockIndex}`,
  });
}

export interface RunTaskEndFlowArgs {
  container: HTMLElement;
  endPages: string[];
  buttonIdPrefix: string;
  completeTitle?: string;
  completeMessage?: string;
  doneButtonLabel?: string;
}

export async function runTaskEndFlow(args: RunTaskEndFlowArgs): Promise<void> {
  await runInstructionScreens({
    container: args.container,
    pages: args.endPages,
    section: "end",
    title: args.completeTitle ?? "Complete",
    buttonIdPrefix: args.buttonIdPrefix,
    renderHtml: (ctx) => `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(ctx.pageText)}</p>`,
  });

  await waitForContinue(
    args.container,
    `<h3>${escapeHtml(args.completeTitle ?? "Complete")}</h3><p>${escapeHtml(args.completeMessage ?? "Task complete. You can close this tab.")}</p>`,
    {
      buttonId: `${args.buttonIdPrefix}-complete`,
      buttonLabel: args.doneButtonLabel ?? "Done",
    },
  );
}
