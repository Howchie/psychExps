import type { JSONObject } from "../api/types";
/**
 * Manages loading and merging of experiment configurations.
 */
export declare class ConfigurationManager {
    /**
     * Loads a JSON configuration file from the specified path.
     */
    load(path: string): Promise<JSONObject>;
    /**
     * Merges multiple configuration levels in sequence:
     * base -> taskDefault -> variantOverride -> runtimeOverride
     */
    merge(base: JSONObject, taskDefault: JSONObject, variantOverride: JSONObject, runtimeOverride?: JSONObject | null): JSONObject;
}
/**
 * LEGACY: Standalone function for loading JSON files.
 * Prefer ConfigurationManager.load().
 */
export declare function loadJsonFile(path: string): Promise<JSONObject>;
/**
 * Standalone function for parsing overrides from URL parameters.
 */
export declare function parseOverridesFromUrl(params: URLSearchParams): JSONObject | null;
/**
 * LEGACY: Standalone function for merging configurations.
 * Prefer ConfigurationManager.merge().
 */
export declare function buildMergedConfig(base: JSONObject, taskDefault: JSONObject, variantOverride: JSONObject, runtimeOverride?: JSONObject | null): JSONObject;
