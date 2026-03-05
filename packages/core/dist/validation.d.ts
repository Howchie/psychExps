import type { JSONObject } from "./types";
export declare function validateTaskConfigIsolation(taskId: string, config: JSONObject, knownTaskIds?: string[]): void;
export declare function validateCoreSelectionDefaults(config: JSONObject): void;
