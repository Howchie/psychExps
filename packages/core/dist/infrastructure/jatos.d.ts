import type { JSONObject } from "../api/types";
declare global {
    interface Window {
        jatos?: {
            submitResultData: (payload: string | JSONObject) => Promise<void>;
            appendResultData?: (payload: string | JSONObject) => Promise<void>;
            endStudy: () => Promise<void>;
            onLoad?: (cb: () => void) => void;
            componentJsonInput?: JSONObject | string;
            studySessionData?: JSONObject | string;
            urlQueryParameters?: Record<string, unknown>;
        };
    }
}
export declare function getJatosApi(): Window["jatos"] | undefined;
export declare function isJatosAvailable(): boolean;
export declare function readJatosSelectionInput(): JSONObject | null;
/**
 * Returns launch query parameters preserved by JATOS across Publix redirects.
 * Falls back to an empty URLSearchParams if not available.
 */
export declare function readJatosUrlQueryParameters(): URLSearchParams;
export declare function submitToJatos(payload: string | JSONObject): Promise<boolean>;
export declare function appendToJatos(payload: string | JSONObject): Promise<boolean>;
export declare function endJatosStudy(): Promise<void>;
