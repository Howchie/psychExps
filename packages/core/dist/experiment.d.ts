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
    blocks: Array<{
        block: TBlock;
        blockIndex: number;
        trialResults: TTrialResult[];
    }>;
}
export declare function runPromptScreens(container: HTMLElement, screens: PromptScreen[]): Promise<void>;
export declare function runBlockTrialLoop<TBlock, TTrial, TTrialResult>(args: RunBlockTrialLoopArgs<TBlock, TTrial, TTrialResult>): Promise<BlockTrialLoopResult<TBlock, TTrialResult>>;
