import type { JSONObject } from "./types";
export declare function deepMerge<T extends JSONObject>(target: T, source: JSONObject | null | undefined): T;
export declare function deepClone<T>(value: T): T;
