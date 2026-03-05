import { setCursorHidden, waitForContinue } from "./ui";

export interface PromptScreen {
  html: string;
  buttonId?: string;
  buttonLabel?: string;
}

export interface TrialLoopContext<TBlock, TTrial, TTrialResult> {
  block: TBlock;
  blockIndex: number;
  trial: TTrial;
  trialIndex: number;
  container: HTMLElement;
  blockTrialResults: TTrialResult[];
}

export interface BlockLoopContext<TBlock, TTrialResult> {
  block: TBlock;
  blockIndex: number;
  trialResults: TTrialResult[];
}

export interface RunBlockTrialLoopArgs<TBlock, TTrial, TTrialResult> {
  container: HTMLElement;
  blocks: TBlock[];
  getTrials?: (block: TBlock) => TTrial[];
  runTrial: (ctx: TrialLoopContext<TBlock, TTrial, TTrialResult>) => Promise<TTrialResult>;
  renderBlockStart?: (ctx: BlockLoopContext<TBlock, TTrialResult>) => string | null;
  renderBlockEnd?: (ctx: BlockLoopContext<TBlock, TTrialResult>) => string | null;
  blockStartButtonId?: (ctx: BlockLoopContext<TBlock, TTrialResult>) => string;
  blockEndButtonId?: (ctx: BlockLoopContext<TBlock, TTrialResult>) => string;
  hideCursorDuringTrial?: boolean | ((ctx: TrialLoopContext<TBlock, TTrial, TTrialResult>) => boolean);
}

export interface BlockTrialLoopResult<TBlock, TTrialResult> {
  blocks: Array<{ block: TBlock; blockIndex: number; trialResults: TTrialResult[] }>;
}

export async function runPromptScreens(container: HTMLElement, screens: PromptScreen[]): Promise<void> {
  for (const screen of screens) {
    await waitForContinue(container, screen.html, {
      buttonId: screen.buttonId,
      buttonLabel: screen.buttonLabel,
    });
  }
}

export async function runBlockTrialLoop<
  TBlock,
  TTrial,
  TTrialResult,
>(
  args: RunBlockTrialLoopArgs<TBlock, TTrial, TTrialResult>,
): Promise<BlockTrialLoopResult<TBlock, TTrialResult>> {
  const blockResults: Array<{ block: TBlock; blockIndex: number; trialResults: TTrialResult[] }> = [];

  for (let blockIndex = 0; blockIndex < args.blocks.length; blockIndex += 1) {
    const block = args.blocks[blockIndex];
    const trialResults: TTrialResult[] = [];
    const blockCtx: BlockLoopContext<TBlock, TTrialResult> = { block, blockIndex, trialResults };

    const startHtml = args.renderBlockStart?.(blockCtx);
    if (startHtml) {
      await waitForContinue(args.container, startHtml, {
        buttonId: args.blockStartButtonId?.(blockCtx),
      });
    }

    const trials = args.getTrials ? args.getTrials(block) : ((block as { trials: TTrial[] }).trials ?? []);
    for (let trialIndex = 0; trialIndex < trials.length; trialIndex += 1) {
      const trial = trials[trialIndex];
      const trialCtx: TrialLoopContext<TBlock, TTrial, TTrialResult> = {
        block,
        blockIndex,
        trial,
        trialIndex,
        container: args.container,
        blockTrialResults: trialResults,
      };
      const shouldHideCursor = typeof args.hideCursorDuringTrial === "function"
        ? args.hideCursorDuringTrial(trialCtx)
        : args.hideCursorDuringTrial !== false;
      setCursorHidden(shouldHideCursor);
      try {
        const trialResult = await args.runTrial(trialCtx);
        trialResults.push(trialResult);
      } finally {
        setCursorHidden(false);
      }
    }

    const endHtml = args.renderBlockEnd?.(blockCtx);
    if (endHtml) {
      await waitForContinue(args.container, endHtml, {
        buttonId: args.blockEndButtonId?.(blockCtx),
      });
    }

    blockResults.push({ block, blockIndex, trialResults });
  }

  return { blocks: blockResults };
}
