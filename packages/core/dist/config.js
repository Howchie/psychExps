import { deepClone, deepMerge } from "./deepMerge";
export async function loadJsonFile(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load config at ${path} (HTTP ${response.status})`);
    }
    const parsed = (await response.json());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Config is not an object: ${path}`);
    }
    return parsed;
}
export function parseOverridesFromUrl(params) {
    const raw = params.get("overrides");
    if (!raw)
        return null;
    try {
        const decoded = decodeURIComponent(raw);
        const parsed = JSON.parse(decoded);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
export function buildMergedConfig(base, taskDefault, variantOverride, runtimeOverride) {
    const merged = deepClone(base);
    deepMerge(merged, taskDefault);
    deepMerge(merged, variantOverride);
    if (runtimeOverride)
        deepMerge(merged, runtimeOverride);
    return merged;
}
//# sourceMappingURL=config.js.map