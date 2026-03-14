import { type InstructionFlowPages, type InstructionScreenRenderContext } from "./instructionFlow";
export interface AppendJsPsychContinuePagesArgs {
    timeline: any[];
    plugin: unknown;
    container: HTMLElement;
    pages: string[];
    phase: string;
    buttonIdPrefix: string;
    html?: (page: string, index: number) => string;
    data?: (index: number) => Record<string, unknown>;
}
export declare function appendJsPsychContinuePages(args: AppendJsPsychContinuePagesArgs): void;
export interface AppendJsPsychInstructionScreensArgs {
    timeline: any[];
    plugin: unknown;
    container: HTMLElement;
    pages: string[];
    section: keyof InstructionFlowPages;
    buttonIdPrefix: string;
    title?: string | null;
    blockLabel?: string | null;
    phase?: string;
    renderHtml?: (ctx: InstructionScreenRenderContext) => string;
    data?: (ctx: InstructionScreenRenderContext) => Record<string, unknown>;
}
export declare function appendJsPsychInstructionScreens(args: AppendJsPsychInstructionScreensArgs): void;
export interface AppendJsPsychTaskIntroScreenArgs {
    timeline: any[];
    plugin: unknown;
    container: HTMLElement;
    title: string;
    participantId?: string | null;
    phase?: string;
    buttonId?: string;
    data?: Record<string, unknown>;
}
export declare function appendJsPsychTaskIntroScreen(args: AppendJsPsychTaskIntroScreenArgs): void;
export interface AppendJsPsychBlockIntroScreenArgs {
    timeline: any[];
    plugin: unknown;
    container: HTMLElement;
    blockLabel: string;
    introText?: string | null;
    showBlockLabel?: boolean;
    phase?: string;
    buttonId?: string;
    data?: Record<string, unknown>;
}
export declare function appendJsPsychBlockIntroScreen(args: AppendJsPsychBlockIntroScreenArgs): void;
