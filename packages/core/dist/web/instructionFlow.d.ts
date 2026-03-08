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
export declare function resolveInstructionFlowPages(config: InstructionFlowConfig): InstructionFlowPages;
export declare function renderInstructionScreenHtml(ctx: InstructionScreenRenderContext): string;
export interface BuiltInstructionScreen {
    ctx: InstructionScreenRenderContext;
    buttonId: string;
}
export interface TaskIntroCardArgs {
    title: string;
    participantId?: string | null;
}
export declare function renderTaskIntroCardHtml(args: TaskIntroCardArgs): string;
export interface BlockIntroCardArgs {
    blockLabel: string;
    introText?: string | null;
}
export declare function renderBlockIntroCardHtml(args: BlockIntroCardArgs): string;
export declare function buildInstructionScreens(args: {
    pages: string[];
    section: keyof InstructionFlowPages;
    title?: string | null;
    blockLabel?: string | null;
    buttonIdPrefix: string;
}): BuiltInstructionScreen[];
export declare function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void>;
