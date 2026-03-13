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
        };
    }
}
export declare function getJatosApi(): Window["jatos"] | undefined;
export declare function isJatosAvailable(): boolean;
export declare function readJatosSelectionInput(): JSONObject | null;
export declare function submitToJatos(payload: string | JSONObject): Promise<boolean>;
export declare function appendToJatos(payload: string | JSONObject): Promise<boolean>;
export declare function endJatosStudy(): Promise<void>;
