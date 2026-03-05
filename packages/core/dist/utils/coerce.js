export function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
export function asArray(value) {
    return Array.isArray(value) ? value : [];
}
export function asString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
export function toPositiveNumber(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        return fallback;
    return Math.floor(n);
}
export function toNonNegativeNumber(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        return fallback;
    return Math.floor(n);
}
export function toUnitNumber(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(0, Math.min(1, n));
}
export function toFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
export function toNumberArray(value, fallback) {
    const out = asArray(value).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
    return out.length > 0 ? out : fallback;
}
export function toStringScreens(value) {
    if (typeof value === "string") {
        const text = value.trim();
        return text ? [text] : [];
    }
    return asArray(value).map((item) => asString(item)).filter((item) => Boolean(item));
}
export function asStringArray(value, fallback) {
    const list = asArray(value).map((item) => asString(item)).filter((item) => Boolean(item));
    return list.length > 0 ? list : [...fallback];
}
export function asPositiveNumberArray(value, fallback) {
    const list = asArray(value)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isFinite(entry) && entry > 0)
        .map((entry) => Math.floor(entry));
    return list.length > 0 ? list : [...fallback];
}
export function resolveInstructionPageSlots(instructions, defaults) {
    const raw = asObject(instructions);
    const hasOwn = (key) => Boolean(raw && Object.prototype.hasOwnProperty.call(raw, key));
    const pickFirstScreens = (keys, fallback) => {
        for (const key of keys) {
            if (!hasOwn(key))
                continue;
            // Explicitly present empty/blank values are treated as intentional clear.
            return toStringScreens(raw?.[key]);
        }
        return toStringScreens(fallback);
    };
    return {
        intro: pickFirstScreens(["pages", "introPages", "intro", "screens"], defaults?.intro),
        preBlock: pickFirstScreens(["preBlockPages", "beforeBlockPages", "beforeBlockScreens"], defaults?.preBlock),
        postBlock: pickFirstScreens(["postBlockPages", "afterBlockPages", "afterBlockScreens"], defaults?.postBlock),
        end: pickFirstScreens(["endPages", "outroPages", "end", "outro"], defaults?.end),
    };
}
//# sourceMappingURL=coerce.js.map