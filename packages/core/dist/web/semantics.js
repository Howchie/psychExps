import { fetchTextNoStore, parseCsvColumn, resolveAssetPath, resolveTemplatedString, splitCsvLine, } from "../web/stimulus";
const defaultNormalize = (value) => String(value || "").trim().toLowerCase();
function ensureUniqueOrResolve(map, key, value, mode) {
    const existing = map.get(key);
    if (!existing) {
        map.set(key, value);
        return;
    }
    if (existing === value)
        return;
    if (mode === "first_wins")
        return;
    if (mode === "last_wins") {
        map.set(key, value);
        return;
    }
    throw new Error(`Semantic index conflict for key '${key}': '${existing}' vs '${value}'.`);
}
export function parseCsvDictionary(csvText, keyColumn, valueColumn, options = {}) {
    const normalize = options.normalize ?? defaultNormalize;
    const onConflict = options.onConflict ?? "error";
    const lines = csvText
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length === 0)
        return new Map();
    const header = splitCsvLine(lines[0]).map((entry) => entry.trim());
    const keyIdx = header.findIndex((entry) => normalize(entry) === normalize(keyColumn));
    const valueIdx = header.findIndex((entry) => normalize(entry) === normalize(valueColumn));
    if (keyIdx < 0 || valueIdx < 0) {
        throw new Error(`CSV dictionary missing required columns '${keyColumn}' and/or '${valueColumn}'.`);
    }
    const out = new Map();
    for (let i = 1; i < lines.length; i += 1) {
        const cols = splitCsvLine(lines[i]);
        const rawKey = cols[keyIdx] ?? "";
        const rawValue = cols[valueIdx] ?? "";
        const key = normalize(rawKey);
        const value = String(rawValue || "").trim();
        if (!key || !value)
            continue;
        ensureUniqueOrResolve(out, key, value, onConflict);
    }
    return out;
}
export async function loadCsvDictionary(spec) {
    const resolverArgs = spec.resolverArgs ?? {};
    const path = resolveTemplatedString({
        ...resolverArgs,
        template: spec.path,
    });
    const keyColumn = resolveTemplatedString({
        ...resolverArgs,
        template: spec.keyColumn,
    });
    const valueColumn = resolveTemplatedString({
        ...resolverArgs,
        template: spec.valueColumn,
    });
    const url = resolveAssetPath({
        basePath: spec.basePath,
        template: path,
        ...(resolverArgs.vars ? { vars: resolverArgs.vars } : {}),
        ...(resolverArgs.resolver ? { resolver: resolverArgs.resolver } : {}),
        ...(resolverArgs.context ? { context: resolverArgs.context } : {}),
    });
    const text = await fetchTextNoStore(url);
    return parseCsvDictionary(text, keyColumn, valueColumn);
}
export function buildSemanticIndex(labelsToTerms, options = {}) {
    const normalize = options.normalize ?? defaultNormalize;
    const onConflict = options.onConflict ?? "error";
    const out = new Map();
    for (const [label, terms] of Object.entries(labelsToTerms ?? {})) {
        const normalizedLabel = String(label || "").trim();
        if (!normalizedLabel)
            continue;
        for (const termLike of terms ?? []) {
            const key = normalize(String(termLike || ""));
            if (!key)
                continue;
            ensureUniqueOrResolve(out, key, normalizedLabel, onConflict);
        }
    }
    return out;
}
export function createSemanticResolver(indexLike, options = {}) {
    const normalize = options.normalize ?? defaultNormalize;
    const index = indexLike instanceof Map
        ? new Map(indexLike)
        : new Map(Object.entries(indexLike ?? {}).map(([key, value]) => [
            normalize(key),
            String(value || "").trim(),
        ]));
    return {
        resolve(term) {
            const key = normalize(term);
            if (!key)
                return null;
            return index.get(key) ?? null;
        },
        has(term) {
            const key = normalize(term);
            if (!key)
                return false;
            return index.has(key);
        },
    };
}
export async function loadSemanticIndexFromCsvColumns(csvPath, keyColumn, labelColumns, args = {}) {
    const merged = new Map();
    for (const [label, valueColumn] of Object.entries(labelColumns)) {
        const dictionary = await loadCsvDictionary({
            ...args,
            path: csvPath,
            keyColumn,
            valueColumn,
        });
        for (const [key, rawValue] of dictionary.entries()) {
            const truthy = String(rawValue || "").trim();
            if (!truthy)
                continue;
            if (truthy === "0" || truthy.toLowerCase() === "false")
                continue;
            if (!merged.has(key)) {
                merged.set(key, label);
            }
        }
    }
    return merged;
}
export async function loadTokenListFromCsvColumn(path, column, args = {}) {
    const resolverArgs = args.resolverArgs ?? {};
    const resolvedPath = resolveTemplatedString({ ...resolverArgs, template: path });
    const resolvedColumn = resolveTemplatedString({ ...resolverArgs, template: column });
    const url = resolveAssetPath({
        basePath: args.basePath,
        template: resolvedPath,
        ...(resolverArgs.vars ? { vars: resolverArgs.vars } : {}),
        ...(resolverArgs.resolver ? { resolver: resolverArgs.resolver } : {}),
        ...(resolverArgs.context ? { context: resolverArgs.context } : {}),
    });
    const text = await fetchTextNoStore(url);
    return parseCsvColumn(text, resolvedColumn);
}
//# sourceMappingURL=semantics.js.map