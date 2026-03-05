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
