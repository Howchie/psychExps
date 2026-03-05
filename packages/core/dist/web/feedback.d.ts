import type { VariableResolver, VariableResolverContext } from "../infrastructure/variables";
import { type CanvasFrameLayout } from "./ui";
export interface TrialFeedbackMessages {
    correct: string;
    incorrect: string;
    timeout: string;
    invalid: string;
    byResponseCategory: Record<string, string>;
}
export interface TrialFeedbackStyle {
    correctColor: string;
    incorrectColor: string;
    timeoutColor: string;
    invalidColor: string;
    byResponseCategoryColors: Record<string, string>;
    fontSizePx: number;
    fontWeight: number;
    canvasBackground: string;
    canvasBorder: string;
}
export interface TrialFeedbackConfig {
    enabled: boolean;
    durationMs: number;
    messages: TrialFeedbackMessages;
    style: TrialFeedbackStyle;
}
export interface TrialFeedbackResolveArgs {
    feedback: TrialFeedbackConfig;
    responseCategory: string;
    correct: number;
    vars?: Record<string, unknown>;
    resolver?: VariableResolver;
    resolverContext?: VariableResolverContext;
}
export interface TrialFeedbackView {
    text: string;
    color: string;
}
export interface TrialFeedbackDefaults {
    enabled?: boolean;
    durationMs?: number;
    messages?: Partial<Omit<TrialFeedbackMessages, "byResponseCategory">> & {
        byResponseCategory?: Record<string, string>;
    };
    style?: Partial<Omit<TrialFeedbackStyle, "byResponseCategoryColors">> & {
        byResponseCategoryColors?: Record<string, string>;
    };
}
export declare function parseTrialFeedbackConfig(value: Record<string, unknown> | null, fallback: TrialFeedbackConfig | null, defaults?: TrialFeedbackDefaults): TrialFeedbackConfig;
export declare function resolveTrialFeedbackView(args: TrialFeedbackResolveArgs): TrialFeedbackView;
export declare function drawTrialFeedbackOnCanvas(ctx: CanvasRenderingContext2D, layout: CanvasFrameLayout, feedback: TrialFeedbackConfig, view: TrialFeedbackView | null): void;
