import type { JSONObject } from "./types";
export declare function loadJsonFile(path: string): Promise<JSONObject>;
export declare function parseOverridesFromUrl(params: URLSearchParams): JSONObject | null;
export declare function buildMergedConfig(base: JSONObject, taskDefault: JSONObject, variantOverride: JSONObject, runtimeOverride?: JSONObject | null): JSONObject;
