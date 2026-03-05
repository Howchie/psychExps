import type { JSONObject } from "../api/types";
declare global {
    interface Window {
        jatos?: {
            submitResultData: (payload: string | JSONObject) => Promise<void>;
            endStudy: () => Promise<void>;
            componentJsonInput?: JSONObject;
            studySessionData?: JSONObject;
        };
    }
}
export declare function isJatosAvailable(): boolean;
export declare function readJatosSelectionInput(): JSONObject | null;
export declare function submitToJatos(payload: string | JSONObject): Promise<boolean>;
export declare function endJatosStudy(): Promise<void>;
