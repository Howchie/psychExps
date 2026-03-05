import { deepClone, deepMerge } from "./deepMerge";
import type { JSONObject } from "./types";

export async function loadJsonFile(path: string): Promise<JSONObject> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load config at ${path} (HTTP ${response.status})`);
  }
  const parsed = (await response.json()) as JSONObject;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config is not an object: ${path}`);
  }
  return parsed;
}

export function parseOverridesFromUrl(params: URLSearchParams): JSONObject | null {
  const raw = params.get("overrides");
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as JSONObject;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildMergedConfig(
  base: JSONObject,
  taskDefault: JSONObject,
  variantOverride: JSONObject,
  runtimeOverride?: JSONObject | null,
): JSONObject {
  const merged = deepClone(base);
  deepMerge(merged, taskDefault);
  deepMerge(merged, variantOverride);
  if (runtimeOverride) deepMerge(merged, runtimeOverride);
  return merged;
}
