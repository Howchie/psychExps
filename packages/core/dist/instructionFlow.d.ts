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
export declare function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void>;
