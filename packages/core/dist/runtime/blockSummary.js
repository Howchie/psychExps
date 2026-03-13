import { escapeHtml } from "../web/ui";
const DEFAULT_SUMMARY = {
    enabled: false,
    at: "block_end_before_post",
    title: "End of {blockLabel}",
    lines: ["Accuracy: {accuracyPct}% ({correct}/{total})"],
    metrics: {
        correctField: "correct",
        rtField: "rt",
    },
};
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function asString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function toStringScreens(value) {
    if (typeof value === "string") {
        const text = value.trim();
        return text ? [text] : [];
    }
    return asArray(value)
        .map((item) => asString(item))
        .filter((item) => Boolean(item));
}
function toFiniteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
function toTextNumber(value, digits = 1) {
    if (!Number.isFinite(value))
        return "0";
    return value.toFixed(digits);
}
function normalizeWhen(raw) {
    if (!raw)
        return undefined;
    const blockIndex = asArray(raw.blockIndex)
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item))
        .map((item) => Math.floor(item));
    const blockLabel = asArray(raw.blockLabel)
        .map((item) => asString(item))
        .filter((item) => Boolean(item));
    const blockType = asArray(raw.blockType)
        .map((item) => asString(item))
        .filter((item) => Boolean(item))
        .map((item) => item.toLowerCase());
    const isPractice = typeof raw.isPractice === "boolean" ? raw.isPractice : undefined;
    if (blockIndex.length === 0 && blockLabel.length === 0 && blockType.length === 0 && typeof isPractice !== "boolean") {
        return undefined;
    }
    return {
        ...(blockIndex.length > 0 ? { blockIndex } : {}),
        ...(blockLabel.length > 0 ? { blockLabel } : {}),
        ...(blockType.length > 0 ? { blockType } : {}),
        ...(typeof isPractice === "boolean" ? { isPractice } : {}),
    };
}
function normalizeWhere(raw) {
    if (!raw)
        return undefined;
    const out = {};
    for (const [field, value] of Object.entries(raw)) {
        const key = String(field || "").trim();
        if (!key)
            continue;
        const values = asArray(value)
            .map((entry) => {
            if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")
                return entry;
            return null;
        })
            .filter((entry) => entry !== null);
        if (values.length > 0) {
            out[key] = values;
            continue;
        }
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            out[key] = value;
        }
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
export function coerceBlockSummaryConfig(value) {
    const raw = asObject(value);
    if (!raw)
        return null;
    const enabled = raw.enabled != null ? raw.enabled !== false : DEFAULT_SUMMARY.enabled;
    const atRaw = (asString(raw.at) || "").toLowerCase();
    const at = atRaw === "block_end_after_post" || atRaw === "after_post" ? "block_end_after_post" : "block_end_before_post";
    const lines = toStringScreens(raw.lines);
    const metrics = asObject(raw.metrics);
    return {
        enabled,
        at,
        title: asString(raw.title) || DEFAULT_SUMMARY.title,
        lines: lines.length > 0 ? lines : DEFAULT_SUMMARY.lines,
        when: normalizeWhen(asObject(raw.when)),
        where: normalizeWhere(asObject(raw.where)),
        metrics: {
            correctField: asString(metrics?.correctField) || DEFAULT_SUMMARY.metrics.correctField,
            rtField: asString(metrics?.rtField) || DEFAULT_SUMMARY.metrics.rtField,
        },
    };
}
export function mergeBlockSummaryConfig(base, override) {
    const overrideRaw = asObject(override);
    if (!overrideRaw)
        return base;
    const mergedRaw = {
        ...(base ?? {}),
        ...overrideRaw,
        metrics: {
            ...(base?.metrics ?? {}),
            ...(asObject(overrideRaw.metrics) ?? {}),
        },
        when: {
            ...(base?.when ?? {}),
            ...(asObject(overrideRaw.when) ?? {}),
        },
        where: {
            ...(base?.where ?? {}),
            ...(asObject(overrideRaw.where) ?? {}),
        },
    };
    return coerceBlockSummaryConfig(mergedRaw);
}
function matchesWhen(when, blockContext) {
    if (!when)
        return true;
    if (Array.isArray(when.blockIndex) && when.blockIndex.length > 0 && !when.blockIndex.includes(blockContext.blockIndex)) {
        return false;
    }
    if (Array.isArray(when.blockLabel) && when.blockLabel.length > 0 && !when.blockLabel.includes(blockContext.blockLabel)) {
        return false;
    }
    if (Array.isArray(when.blockType) && when.blockType.length > 0 && !when.blockType.includes(blockContext.blockType)) {
        return false;
    }
    if (typeof when.isPractice === "boolean" && when.isPractice !== blockContext.isPractice) {
        return false;
    }
    return true;
}
export function computeBlockSummaryStats(args) {
    const { trialResults, where, metrics } = args;
    const rows = Array.isArray(trialResults) ? trialResults : [];
    const filteredRows = rows.filter((row) => {
        if (!where)
            return true;
        const record = asObject(row);
        if (!record)
            return false;
        for (const [field, expectedRaw] of Object.entries(where)) {
            const actual = record[field];
            const expectedValues = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
            const matched = expectedValues.some((expected) => String(actual) === String(expected));
            if (!matched)
                return false;
        }
        return true;
    });
    const total = filteredRows.length;
    let correct = 0;
    let rtSum = 0;
    let validRtCount = 0;
    for (const row of filteredRows) {
        const record = asObject(row);
        const correctRaw = record ? record[metrics.correctField] : null;
        if (correctRaw === true || Number(correctRaw) === 1)
            correct += 1;
        const rtRaw = record ? record[metrics.rtField] : null;
        const rt = toFiniteNumber(rtRaw);
        if (rt != null && rt >= 0) {
            rtSum += rt;
            validRtCount += 1;
        }
    }
    const accuracyPct = total > 0 ? (correct / total) * 100 : 0;
    const meanRtMs = validRtCount > 0 ? rtSum / validRtCount : 0;
    return { total, correct, accuracyPct, meanRtMs, validRtCount };
}
function applyTemplate(template, vars) {
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => vars[key] ?? "");
}
export function buildBlockSummaryModel(args) {
    const cfg = args.config;
    if (!cfg || !cfg.enabled)
        return null;
    const block = asObject(args.block);
    const blockLabel = asString(block?.label) || `Block ${args.blockIndex + 1}`;
    const blockType = (asString(block?.blockType) || "").toLowerCase();
    const isPractice = Boolean(block?.isPractice);
    if (!matchesWhen(cfg.when, { blockIndex: args.blockIndex, blockLabel, blockType, isPractice }))
        return null;
    const fromTrials = computeBlockSummaryStats({
        trialResults: args.trialResults ?? [],
        where: cfg.where,
        metrics: cfg.metrics,
    });
    const total = fromTrials.total > 0 ? fromTrials.total : Math.max(0, Math.floor(args.fallbackStats?.total ?? 0));
    const correct = fromTrials.total > 0 ? fromTrials.correct : Math.max(0, Math.floor(args.fallbackStats?.correct ?? 0));
    const incorrect = Math.max(0, total - correct);
    const accuracyPct = fromTrials.total > 0
        ? fromTrials.accuracyPct
        : (Number.isFinite(Number(args.fallbackStats?.accuracyPct)) ? Number(args.fallbackStats?.accuracyPct) : (total > 0 ? (correct / total) * 100 : 0));
    const validRtCount = fromTrials.validRtCount > 0 ? fromTrials.validRtCount : Math.max(0, Math.floor(args.fallbackStats?.validRtCount ?? 0));
    const meanRtMs = fromTrials.validRtCount > 0
        ? fromTrials.meanRtMs
        : (Number.isFinite(Number(args.fallbackStats?.meanRtMs)) ? Number(args.fallbackStats?.meanRtMs) : 0);
    const vars = {
        blockLabel,
        blockIndex: String(args.blockIndex),
        blockIndex1: String(args.blockIndex + 1),
        blockType,
        isPractice: isPractice ? "1" : "0",
        total: String(total),
        correct: String(correct),
        incorrect: String(incorrect),
        accuracyPct: toTextNumber(accuracyPct, 1),
        meanRtMs: toTextNumber(meanRtMs, 1),
        validRtCount: String(validRtCount),
    };
    const title = applyTemplate(cfg.title, vars);
    const lines = cfg.lines.map((line) => applyTemplate(line, vars));
    const text = [title, ...lines].filter((line) => line.trim().length > 0).join("\n");
    if (!text)
        return null;
    return { at: cfg.at, title, lines, text };
}
export function renderBlockSummaryCardHtml(model) {
    const title = model.title.trim() ? `<h3>${escapeHtml(model.title)}</h3>` : "";
    const body = model.lines
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");
    return `${title}${body}`;
}
//# sourceMappingURL=blockSummary.js.map