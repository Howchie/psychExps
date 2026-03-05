export interface RunTaskIntroFlowArgs {
    container: HTMLElement;
    title: string;
    participantId?: string | null;
    introPages: string[];
    buttonIdPrefix: string;
}
export declare function runTaskIntroFlow(args: RunTaskIntroFlowArgs): Promise<void>;
export interface RunBlockUiFlowArgs {
    container: HTMLElement;
    blockLabel: string;
    blockIndex: number;
    buttonIdPrefix: string;
    introText?: string | null;
    preBlockPages?: string[];
    postBlockPages?: string[];
}
export declare function runBlockStartFlow(args: RunBlockUiFlowArgs): Promise<void>;
export declare function runBlockEndFlow(args: RunBlockUiFlowArgs): Promise<void>;
export interface RunTaskEndFlowArgs {
    container: HTMLElement;
    endPages: string[];
    buttonIdPrefix: string;
    completeTitle?: string;
    completeMessage?: string;
    doneButtonLabel?: string;
}
export declare function runTaskEndFlow(args: RunTaskEndFlowArgs): Promise<void>;
