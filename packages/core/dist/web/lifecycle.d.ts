import type { CoreConfig, SelectionContext } from "../api/types";
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
    jatosHandledBySink?: boolean;
}
export interface FinalizeTaskRunResult {
    submittedToJatos: boolean;
    redirected: boolean;
}
export declare function finalizeTaskRun(args: FinalizeTaskRunArgs): Promise<FinalizeTaskRunResult>;
