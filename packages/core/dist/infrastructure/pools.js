import { asArray, asObject, asString } from "../utils/coerce";
import { loadTokenListFromCsvColumn } from "../web/semantics";
import { loadStimuliPoolsFromCsv, } from "../web/stimulus";
const DEFAULT_POOL_DRAW = {
    mode: "without_replacement",
    shuffle: true,
};
const DEFAULT_CATEGORY_DRAW = {
    mode: "round_robin",
    shuffle: true,
};
function pickIndex(rng, maxExclusive) {
    if (maxExclusive <= 1)
        return 0;
    if (typeof rng.int === "function")
        return rng.int(0, maxExclusive - 1);
    return Math.min(maxExclusive - 1, Math.floor(rng.next() * maxExclusive));
}
function sanitizeToken(value) {
    const token = asString(value)?.trim();
    return token ? token : null;
}
function normalizePoolRecord(source) {
    const out = {};
    for (const [category, raw] of Object.entries(source)) {
        const values = asArray(raw).map(sanitizeToken).filter((item) => Boolean(item));
        if (values.length > 0)
            out[category] = values;
    }
    return out;
}
export function coercePoolDrawConfig(value, defaults = DEFAULT_POOL_DRAW) {
    const raw = asObject(value);
    const modeRaw = asString(raw?.mode)?.toLowerCase();
    const mode = modeRaw === "ordered" || modeRaw === "with_replacement" || modeRaw === "without_replacement"
        ? modeRaw
        : defaults.mode;
    const shuffle = raw?.shuffle === undefined ? defaults.shuffle : raw.shuffle !== false;
    return { mode, shuffle };
}
export function coerceCategoryDrawConfig(value, defaults = DEFAULT_CATEGORY_DRAW) {
    const raw = asObject(value);
    const modeRaw = asString(raw?.mode)?.toLowerCase();
    const mode = modeRaw === "ordered" || modeRaw === "with_replacement" || modeRaw === "without_replacement" || modeRaw === "round_robin"
        ? modeRaw
        : defaults.mode;
    const shuffle = raw?.shuffle === undefined ? defaults.shuffle : raw.shuffle !== false;
    return { mode, shuffle };
}
export function collectPoolCandidates(pools, categories, excludedCategories) {
    const out = [];
    for (const category of categories) {
        if (excludedCategories?.has(category))
            continue;
        const items = pools[category] ?? [];
        for (const item of items)
            out.push({ item, category });
    }
    return out;
}
export function createPoolDrawer(candidates, rng, drawConfig) {
    if (candidates.length === 0) {
        throw new Error("No stimulus candidates available.");
    }
    const config = coercePoolDrawConfig(drawConfig, DEFAULT_POOL_DRAW);
    const basePool = [...candidates];
    let pool = [...basePool];
    let index = 0;
    if (config.mode === "with_replacement") {
        return () => basePool[pickIndex(rng, basePool.length)];
    }
    const resetPool = () => {
        pool = [...basePool];
        if (config.shuffle)
            rng.shuffle(pool);
        index = 0;
    };
    if (config.mode === "without_replacement") {
        resetPool();
        return () => {
            if (index >= pool.length)
                resetPool();
            const picked = pool[index];
            index += 1;
            return picked;
        };
    }
    return () => {
        if (index >= pool.length)
            index = 0;
        const picked = pool[index];
        index += 1;
        return picked;
    };
}
export function createCategoryPoolDrawer(pools, categories, rng, options) {
    const valid = categories.filter((category) => (pools[category] ?? []).length > 0);
    if (valid.length === 0) {
        const fallback = Object.entries(pools).find(([, items]) => items.length > 0);
        if (!fallback)
            throw new Error("No available stimulus pools.");
        const fallbackPool = fallback[1].map((item) => ({ item, category: fallback[0] }));
        const draw = createPoolDrawer(fallbackPool, rng, options?.itemDraw ?? DEFAULT_POOL_DRAW);
        return () => draw();
    }
    const categoryConfig = coerceCategoryDrawConfig(options?.categoryDraw, DEFAULT_CATEGORY_DRAW);
    const itemConfig = coercePoolDrawConfig(options?.itemDraw, DEFAULT_POOL_DRAW);
    const itemDrawers = new Map();
    for (const category of valid) {
        itemDrawers.set(category, createPoolDrawer((pools[category] ?? []).map((item) => ({ item, category })), rng, itemConfig));
    }
    if (categoryConfig.mode === "round_robin") {
        const ordered = [...valid];
        let cursor = 0;
        return () => {
            const category = ordered[cursor % ordered.length];
            cursor += 1;
            return (itemDrawers.get(category) ?? (() => { throw new Error("Missing category drawer."); }))();
        };
    }
    const categoryPool = valid.map((category) => ({ item: category, category: "__category__" }));
    const drawCategory = createPoolDrawer(categoryPool, rng, {
        mode: categoryConfig.mode,
        shuffle: categoryConfig.shuffle,
    });
    return () => {
        const category = drawCategory().item;
        return (itemDrawers.get(category) ?? (() => { throw new Error("Missing category drawer."); }))();
    };
}
export function coerceCsvStimulusConfig(value) {
    const raw = asObject(value);
    if (!raw)
        return null;
    const categoriesRaw = asObject(raw.categories);
    if (!categoriesRaw)
        return null;
    const categories = {};
    for (const [category, specLike] of Object.entries(categoriesRaw)) {
        const pathAsString = asString(specLike);
        if (pathAsString) {
            categories[category] = pathAsString;
            continue;
        }
        const specObj = asObject(specLike);
        if (!specObj)
            continue;
        const path = asString(specObj.path);
        if (!path)
            continue;
        const column = asString(specObj.column);
        const idColumn = asString(specObj.idColumn);
        categories[category] = { path, ...(column ? { column } : {}), ...(idColumn ? { idColumn } : {}) };
    }
    if (Object.keys(categories).length === 0)
        return null;
    return {
        basePath: asString(raw.basePath) || "",
        defaultIdColumn: asString(raw.idColumn) || asString(raw.defaultIdColumn) || "file",
        categories,
    };
}
export async function loadCategorizedStimulusPools(args) {
    const inline = normalizePoolRecord(args.inlinePools);
    if (!args.csvConfig)
        return inline;
    const loaded = await loadStimuliPoolsFromCsv(args.csvConfig, args.resolver, args.context);
    const out = { ...inline };
    for (const [category, values] of Object.entries(loaded)) {
        if (values.length > 0)
            out[category] = values;
    }
    return out;
}
export async function loadTokenPool(args) {
    const normalize = args.normalize ?? "none";
    const dedupe = args.dedupe !== false;
    const inline = asArray(args.inline)
        .map(sanitizeToken)
        .filter((item) => Boolean(item))
        .map((item) => (normalize === "lowercase" ? item.toLowerCase() : item));
    const csvSpec = args.csv && asString(args.csv.path)
        ? args.csv
        : null;
    const csvItems = csvSpec
        ? (await loadTokenListFromCsvColumn(csvSpec.path, csvSpec.column || "word", { basePath: csvSpec.basePath }))
            .map((item) => (normalize === "lowercase" ? item.toLowerCase() : item))
        : [];
    const merged = [...inline, ...csvItems];
    if (!dedupe)
        return merged;
    const seen = new Set();
    const out = [];
    for (const item of merged) {
        if (seen.has(item))
            continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}
//# sourceMappingURL=pools.js.map