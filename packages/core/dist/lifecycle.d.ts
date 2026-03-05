import type { CoreConfig, SelectionContext } from "./types";
export interface FinalizeTaskRunArgs {
    coreConfig: CoreConfig;
    selection: SelectionContext;
    payload: unknown;
    csv?: {
        contents: string;
        suffix?: string;
    } | null;
    completionStatus?: "complete" | "incomplete";
    endJatosOnSubmit?: boolean;
}
export interface FinalizeTaskRunResult {
    submittedToJatos: boolean;
    redirected: boolean;
}
export declare function finalizeTaskRun(args: FinalizeTaskRunArgs): Promise<FinalizeTaskRunResult>;
