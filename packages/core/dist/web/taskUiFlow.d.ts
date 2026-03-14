import { type ButtonStyleOverrides } from "./ui";
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
    continueButtonStyle?: ButtonStyleOverrides;
    autoFocusContinueButton?: boolean;
    renderHtml?: (ctx: {
        pageText: string;
        pageHtml?: string;
        pageTitle?: string;
        pageActions?: Array<{
            id?: string;
            label: string;
            action?: "continue" | "exit";
        }>;
        pageIndex: number;
        section: string;
    }) => string;
}
export declare function runTaskIntroFlow(args: RunTaskIntroFlowArgs): Promise<void>;
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
    variables?: Record<string, unknown>;
    continueButtonStyle?: ButtonStyleOverrides;
    autoFocusContinueButton?: boolean;
    renderHtml?: (ctx: {
        pageText: string;
        pageHtml?: string;
        pageTitle?: string;
        pageActions?: Array<{
            id?: string;
            label: string;
            action?: "continue" | "exit";
        }>;
        pageIndex: number;
        section: string;
        blockLabel?: string | null;
    }) => string;
}
export declare function runBlockStartFlow(args: RunBlockUiFlowArgs): Promise<void>;
export declare function runBlockEndFlow(args: RunBlockUiFlowArgs): Promise<void>;
export interface RunTaskEndFlowArgs {
    container: HTMLElement;
    beforeEndPages?: InstructionPage[][];
    endPages: InstructionPage[];
    afterEndPages?: InstructionPage[][];
    buttonIdPrefix: string;
    completeTitle?: string;
    completeMessage?: string;
    doneButtonLabel?: string;
    continueButtonStyle?: ButtonStyleOverrides;
    autoFocusContinueButton?: boolean;
    renderHtml?: (ctx: {
        pageText: string;
        pageHtml?: string;
        pageTitle?: string;
        pageActions?: Array<{
            id?: string;
            label: string;
            action?: "continue" | "exit";
        }>;
        pageIndex: number;
        section: string;
    }) => string;
}
export declare function runTaskEndFlow(args: RunTaskEndFlowArgs): Promise<void>;
export {};
