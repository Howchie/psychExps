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
const INSTRUCTION_INSERTION_POINTS = new Set([
    "task_intro_before",
    "task_intro_after",
    "block_start_before_intro",
    "block_start_after_intro",
    "block_start_after_pre",
    "block_end_before_post",
    "block_end_after_post",
    "task_end_before",
    "task_end_after",
]);
export function coerceInstructionInsertions(value) {
    const out = [];
    for (const entry of asArray(value)) {
        const raw = asObject(entry);
        if (!raw)
            continue;
        const rawPoint = asString(raw.at) ?? asString(raw.point) ?? asString(raw.target);
        if (!rawPoint)
            continue;
        const at = rawPoint.toLowerCase();
        if (!INSTRUCTION_INSERTION_POINTS.has(at))
            continue;
        const pages = toInstructionScreenSpecs(raw.pages);
        if (pages.length === 0)
            continue;
        const whenRaw = asObject(raw.when);
        const blockIndex = asArray(whenRaw?.blockIndex)
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item))
            .map((item) => Math.floor(item));
        const blockLabel = asArray(whenRaw?.blockLabel)
            .map((item) => asString(item))
            .filter((item) => Boolean(item));
        const blockType = asArray(whenRaw?.blockType)
            .map((item) => asString(item))
            .filter((item) => Boolean(item))
            .map((item) => item.toLowerCase());
        const isPractice = typeof whenRaw?.isPractice === "boolean" ? whenRaw.isPractice : undefined;
        const when = blockIndex.length > 0 || blockLabel.length > 0 || blockType.length > 0 || typeof isPractice === "boolean"
            ? {
                ...(blockIndex.length > 0 ? { blockIndex } : {}),
                ...(blockLabel.length > 0 ? { blockLabel } : {}),
                ...(blockType.length > 0 ? { blockType } : {}),
                ...(typeof isPractice === "boolean" ? { isPractice } : {}),
            }
            : undefined;
        out.push({
            ...(asString(raw.id) ? { id: asString(raw.id) } : {}),
            at,
            pages,
            ...(when ? { when } : {}),
        });
    }
    return out;
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
export function toInstructionScreenSpecs(value) {
    if (typeof value === "string") {
        const text = value.trim();
        return text ? [{ text }] : [];
    }
    return asArray(value)
        .map((item) => {
        if (typeof item === "string") {
            const text = item.trim();
            return text ? { text } : null;
        }
        const raw = asObject(item);
        if (!raw)
            return null;
        const title = asString(raw.title) ?? undefined;
        const html = asString(raw.html) ?? undefined;
        const text = asString(raw.text) ?? asString(raw.body) ?? asString(raw.content) ?? undefined;
        const actions = asArray(raw.actions)
            .map((entry) => {
            const actionRaw = asObject(entry);
            if (!actionRaw)
                return null;
            const label = asString(actionRaw.label);
            if (!label)
                return null;
            const action = (asString(actionRaw.action) ?? "continue").toLowerCase();
            return {
                ...(asString(actionRaw.id) ? { id: asString(actionRaw.id) } : {}),
                label,
                action: action === "exit" ? "exit" : "continue",
            };
        })
            .filter((entry) => Boolean(entry));
        if (!html && !text)
            return null;
        return {
            ...(title ? { title } : {}),
            ...(text ? { text } : {}),
            ...(html ? { html } : {}),
            ...(actions.length > 0 ? { actions } : {}),
        };
    })
        .filter((item) => Boolean(item));
}
export function resolveInstructionScreenSlots(instructions, defaults) {
    const raw = asObject(instructions);
    const hasOwn = (key) => Boolean(raw && Object.prototype.hasOwnProperty.call(raw, key));
    const pickFirstScreens = (keys, fallback) => {
        for (const key of keys) {
            if (!hasOwn(key))
                continue;
            return toInstructionScreenSpecs(raw?.[key]);
        }
        return Array.isArray(fallback) ? [...fallback] : [];
    };
    return {
        intro: pickFirstScreens(["pages", "introPages", "intro", "screens"], defaults?.intro),
        preBlock: pickFirstScreens(["preBlockPages", "beforeBlockPages", "beforeBlockScreens"], defaults?.preBlock),
        postBlock: pickFirstScreens(["postBlockPages", "afterBlockPages", "afterBlockScreens"], defaults?.postBlock),
        end: pickFirstScreens(["endPages", "outroPages", "end", "outro"], defaults?.end),
    };
}
//# sourceMappingURL=coerce.js.map