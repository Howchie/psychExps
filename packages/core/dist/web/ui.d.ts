import type { CoreConfig, JSONObject } from "../api/types";
export interface TimedResponse {
    key: string | null;
    rtMs: number | null;
}
export interface CaptureTimedResponseArgs {
    allowedKeys: string[];
    totalDurationMs: number;
    startMs?: number;
    endMs?: number;
}
export interface ContinuePromptOptions {
    buttonId?: string;
    buttonLabel?: string;
    buttonStyle?: ButtonStyleOverrides;
    autoFocusButton?: boolean;
}
export interface ContinueChoiceOption {
    id: string;
    label: string;
    action: "continue" | "exit";
}
export interface ContinueChoicePromptOptions {
    buttons: ContinueChoiceOption[];
    buttonStyle?: ButtonStyleOverrides;
    autoFocusFirstButton?: boolean;
}
export interface ButtonStyleOverrides {
    padding?: string;
    fontSize?: string;
    fontWeight?: string | number;
    border?: string;
    borderRadius?: string;
    color?: string;
    background?: string;
    minWidth?: string;
    minHeight?: string;
    outline?: string;
    boxShadow?: string;
}
export interface CenteredNoticeOptions {
    title: string;
    message?: string;
}
export interface FixedTrialFrameOptions {
    aperturePx: number;
    innerHtml?: string;
    cueHtml?: string | null;
    paddingYPx?: number;
    cueHeightPx?: number;
    cueMarginBottomPx?: number;
    canvasBackground?: string;
    canvasBorder?: string;
}
export interface CenteredMessageFrameOptions extends FixedTrialFrameOptions {
    message: string;
    messageColor?: string;
    fontSizePx?: number;
    fontWeight?: number;
}
export interface CanvasFrameLayoutOptions {
    aperturePx: number;
    paddingYPx?: number;
    cueHeightPx?: number;
    cueMarginBottomPx?: number;
}
export interface CanvasFrameLayout {
    aperturePx: number;
    paddingYPx: number;
    cueHeightPx: number;
    cueMarginBottomPx: number;
    frameTopPx: number;
    totalHeightPx: number;
}
export interface CanvasFrameDrawOptions {
    cueText?: string;
    cueColor?: string;
    frameBackground?: string;
    frameBorder?: string;
}
export interface CanvasFrameContentContext {
    ctx: CanvasRenderingContext2D;
    layout: CanvasFrameLayout;
    centerX: number;
    centerY: number;
    frameLeft: number;
    frameTop: number;
    frameSize: number;
}
export interface MountCanvasElementArgs {
    container: HTMLElement;
    width: number;
    height: number;
    wrapperClassName?: string;
    canvasClassName?: string;
}
export interface MountedCanvasElement {
    wrapper: HTMLDivElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
}
export interface CanvasCenteredMessageOptions extends CanvasFrameDrawOptions {
    message: string;
    messageColor?: string;
    fontSizePx?: number;
    fontWeight?: number;
}
export interface CanvasHostHandle {
    stageShell: HTMLElement;
    container: HTMLElement;
    updateScale: () => void;
    dispose: () => void;
}
export interface CreateScaledCanvasHostArgs {
    displayElement: HTMLElement;
    canvasWidth: number;
    canvasHeight: number;
    viewportPaddingPx?: number;
}
export declare function resolvePageBackground(args: {
    coreConfig?: CoreConfig | null;
    taskConfig?: JSONObject | null;
}): string | null;
export declare function setCursorHidden(hidden: boolean): void;
export declare function normalizeKey(key: string): string;
export declare function toJsPsychKey(key: string): string;
export declare function toJsPsychChoices(keys: string[]): string[];
export declare function installKeyScrollBlocker(allowedKeys: string[]): () => void;
/**
 * Prevent browser scrolling keys during active task runs.
 * This applies task-agnostically so keys like space can be used as responses
 * without moving the page.
 */
export declare function installGlobalScrollBlocker(blockedKeys?: string[]): () => void;
/**
 * Lock page scrolling during active task execution.
 * Returns a disposer that restores prior overflow styles.
 */
export declare function lockPageScroll(): () => void;
export declare function installFullscreenOnFirstInteraction(container: HTMLElement): () => void;
export declare function escapeHtml(value: string): string;
export declare function sleep(ms: number): Promise<void>;
export declare function resolveButtonStyleOverrides(raw: unknown): ButtonStyleOverrides | undefined;
export declare function applyButtonStyleOverrides(button: HTMLButtonElement, style: ButtonStyleOverrides | undefined): void;
export declare function waitForContinue(container: HTMLElement, html: string, options?: ContinuePromptOptions): Promise<void>;
export declare function waitForContinueChoice(container: HTMLElement, html: string, options: ContinueChoicePromptOptions): Promise<ContinueChoiceOption>;
export declare function captureTimedResponse(args: CaptureTimedResponseArgs): Promise<TimedResponse>;
export declare function renderFixedTrialFrame(options: FixedTrialFrameOptions): string;
export declare function renderCenteredMessageFrame(options: CenteredMessageFrameOptions): string;
export declare function renderCenteredNotice(options: CenteredNoticeOptions): string;
export declare function computeCanvasFrameLayout(options: CanvasFrameLayoutOptions): CanvasFrameLayout;
export declare function drawCanvasTrialFrame(ctx: CanvasRenderingContext2D, layout: CanvasFrameLayout, options?: CanvasFrameDrawOptions): void;
export declare function drawCanvasFramedScene(ctx: CanvasRenderingContext2D, layout: CanvasFrameLayout, options: CanvasFrameDrawOptions, drawContent?: (args: CanvasFrameContentContext) => void): void;
export declare function drawCanvasCenteredText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, options?: {
    color?: string;
    fontSizePx?: number;
    fontWeight?: number;
}): void;
export declare function drawCenteredCanvasMessage(ctx: CanvasRenderingContext2D, layout: CanvasFrameLayout, options: CanvasCenteredMessageOptions): void;
export declare function createScaledCanvasHost(args: CreateScaledCanvasHostArgs): CanvasHostHandle;
export declare function mountCanvasElement(args: MountCanvasElementArgs): MountedCanvasElement;
export declare function ensureJsPsychCanvasCentered(container: HTMLElement): void;
export declare function resolveJsPsychContentHost(container: HTMLElement): HTMLElement;
export declare function pushJsPsychContinueScreen(timeline: any[], plugin: unknown, container: HTMLElement, html: string, phase: string, buttonId: string, data?: Record<string, unknown>): void;
