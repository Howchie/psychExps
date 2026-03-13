import { type ButtonStyleOverrides } from "./ui";
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
    pageActions?: Array<{
        id?: string;
        label: string;
        action?: "continue" | "exit";
    }>;
    section: string;
    pageIndex: number;
    blockLabel?: string | null;
}
export declare class InstructionFlowExitRequestedError extends Error {
    constructor(message?: string);
}
export declare function isInstructionFlowExitRequestedError(value: unknown): value is InstructionFlowExitRequestedError;
export interface RunInstructionScreensArgs {
    container: HTMLElement;
    pages: unknown;
    section: string;
    title?: string | null;
    blockLabel?: string | null;
    buttonIdPrefix: string;
    continueButtonStyle?: ButtonStyleOverrides;
    autoFocusContinueButton?: boolean;
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
    showBlockLabel?: boolean;
}
export declare function renderBlockIntroCardHtml(args: BlockIntroCardArgs): string;
export declare function buildInstructionScreens(args: {
    pages: unknown;
    section: string;
    title?: string | null;
    blockLabel?: string | null;
    buttonIdPrefix: string;
}): BuiltInstructionScreen[];
export declare function runInstructionScreens(args: RunInstructionScreensArgs): Promise<void>;
