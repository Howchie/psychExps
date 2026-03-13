import type { CoreConfig, SelectionContext } from "../api/types";
export interface JatosScriptLoadResult {
    loaded: boolean;
    loadedFrom: string | null;
    attempts: string[];
}
export declare function loadJatosScriptCandidates(candidates?: string[]): Promise<JatosScriptLoadResult>;
export declare function waitForJatosReady(timeoutMs?: number): Promise<void>;
export declare function resolveSelectionWithJatosRetry(coreConfig: CoreConfig, maxWaitMs?: number): Promise<SelectionContext>;
