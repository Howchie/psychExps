import { normalizeKey } from "./ui";
const DEFAULT_TIMEOUT_CATEGORY = "timeout";
const DEFAULT_INVALID_CATEGORY = "invalid";
function normalizeCategory(value) {
    return String(value || "").trim();
}
function normalizeKeys(value) {
    const values = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const out = [];
    for (const entry of values) {
        const normalized = normalizeKey(String(entry || ""));
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}
export function createResponseSemantics(categoryToKeys, options = {}) {
    const timeoutCategory = normalizeCategory(options.timeoutCategory ?? DEFAULT_TIMEOUT_CATEGORY);
    const invalidCategory = normalizeCategory(options.invalidCategory ?? DEFAULT_INVALID_CATEGORY);
    const duplicateKeyPolicy = options.duplicateKeyPolicy ?? "error";
    const orderedCategories = [];
    const categoryKeys = new Map();
    const keyToCategory = new Map();
    const categoryByLookup = new Map();
    for (const [rawCategory, rawKeys] of Object.entries(categoryToKeys ?? {})) {
        const category = normalizeCategory(rawCategory);
        if (!category)
            continue;
        const keys = normalizeKeys(rawKeys);
        if (keys.length === 0)
            continue;
        orderedCategories.push(category);
        categoryKeys.set(category, keys);
        categoryByLookup.set(category.toLowerCase(), category);
        for (const key of keys) {
            const existing = keyToCategory.get(key);
            if (!existing) {
                keyToCategory.set(key, category);
                continue;
            }
            if (existing === category)
                continue;
            if (duplicateKeyPolicy === "first_wins")
                continue;
            if (duplicateKeyPolicy === "last_wins") {
                keyToCategory.set(key, category);
                continue;
            }
            throw new Error(`Response semantics conflict: key '${key}' is mapped to both '${existing}' and '${category}'.`);
        }
    }
    if (orderedCategories.length === 0) {
        throw new Error("Response semantics invalid: no categories with keys were provided.");
    }
    const categorySet = new Set(orderedCategories);
    categoryByLookup.set(timeoutCategory.toLowerCase(), timeoutCategory);
    categoryByLookup.set(invalidCategory.toLowerCase(), invalidCategory);
    return {
        categories() {
            return [...orderedCategories];
        },
        categoriesWithMeta() {
            const out = [...orderedCategories];
            if (!out.includes(timeoutCategory))
                out.push(timeoutCategory);
            if (!out.includes(invalidCategory))
                out.push(invalidCategory);
            return out;
        },
        allowedKeys(categories) {
            const requested = Array.isArray(categories) && categories.length > 0
                ? categories.map(normalizeCategory).filter(Boolean)
                : orderedCategories;
            const seen = new Set();
            const out = [];
            for (const category of requested) {
                const keys = categoryKeys.get(category) ?? [];
                for (const key of keys) {
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    out.push(key);
                }
            }
            return out;
        },
        responseCategoryFromKey(key) {
            const normalized = normalizeKey(String(key || ""));
            if (!normalized)
                return timeoutCategory;
            return keyToCategory.get(normalized) ?? invalidCategory;
        },
        expectedCategoryFromKey(key, fallbackCategory) {
            const normalized = normalizeKey(String(key || ""));
            const fallback = normalizeCategory(fallbackCategory || invalidCategory) || invalidCategory;
            if (!normalized)
                return fallback;
            return keyToCategory.get(normalized) ?? fallback;
        },
        expectedCategoryFromSpec(spec, fallbackCategory) {
            const raw = normalizeCategory(String(spec || ""));
            const fallback = normalizeCategory(fallbackCategory || invalidCategory) || invalidCategory;
            if (!raw)
                return fallback;
            const byCategory = categoryByLookup.get(raw.toLowerCase());
            if (byCategory)
                return byCategory;
            return keyToCategory.get(normalizeKey(raw)) ?? fallback;
        },
        keyForCategory(category) {
            const keys = categoryKeys.get(normalizeCategory(category)) ?? [];
            return keys[0] ?? null;
        },
        hasCategory(category) {
            return categorySet.has(normalizeCategory(category));
        },
        hasResponseCategory(category) {
            const normalized = normalizeCategory(category);
            if (!normalized)
                return false;
            return Boolean(categoryByLookup.get(normalized.toLowerCase()));
        },
    };
}
//# sourceMappingURL=responseSemantics.js.map