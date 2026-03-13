import { computeBlockSummaryStats } from "./blockSummary";
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
function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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
function normalizeMinAccuracy(raw) {
    const numeric = toNumber(raw);
    if (numeric == null)
        return undefined;
    if (numeric > 1)
        return Math.min(1, Math.max(0, numeric / 100));
    return Math.min(1, Math.max(0, numeric));
}
export function coerceBlockRepeatUntilConfig(value) {
    const raw = asObject(value);
    if (!raw)
        return null;
    const metricsRaw = asObject(raw.metrics);
    const maxAttempts = Math.max(1, Math.floor(toNumber(raw.maxAttempts) ?? 1));
    const minCorrect = toNumber(raw.minCorrect);
    const minTotal = toNumber(raw.minTotal);
    return {
        enabled: raw.enabled !== false,
        maxAttempts,
        minAccuracy: normalizeMinAccuracy(raw.minAccuracy ?? raw.minAccuracyPct),
        minCorrect: minCorrect != null ? Math.max(0, Math.floor(minCorrect)) : undefined,
        minTotal: minTotal != null ? Math.max(0, Math.floor(minTotal)) : undefined,
        where: normalizeWhere(asObject(raw.where)),
        metrics: {
            correctField: asString(metricsRaw?.correctField) || "correct",
        },
    };
}
export function evaluateBlockRepeatUntil(args) {
    const cfg = args.config;
    const fallback = {
        enabled: false,
        maxAttempts: 1,
        attemptIndex: args.attemptIndex,
        passed: true,
        shouldRepeat: false,
        reason: "disabled",
        stats: { total: 0, correct: 0, accuracy: 0 },
    };
    if (!cfg || !cfg.enabled)
        return fallback;
    const stats = computeBlockSummaryStats({
        trialResults: args.trialResults,
        where: cfg.where,
        metrics: {
            correctField: cfg.metrics.correctField,
            rtField: "rt",
        },
    });
    const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    const thresholdChecks = [];
    if (typeof cfg.minAccuracy === "number")
        thresholdChecks.push(accuracy >= cfg.minAccuracy);
    if (typeof cfg.minCorrect === "number")
        thresholdChecks.push(stats.correct >= cfg.minCorrect);
    if (typeof cfg.minTotal === "number")
        thresholdChecks.push(stats.total >= cfg.minTotal);
    const passed = thresholdChecks.length > 0 ? thresholdChecks.every(Boolean) : true;
    const maxAttemptsReached = args.attemptIndex + 1 >= cfg.maxAttempts;
    const shouldRepeat = !passed && !maxAttemptsReached;
    const reason = passed
        ? "threshold_met"
        : maxAttemptsReached
            ? "max_attempts_reached"
            : "threshold_not_met";
    return {
        enabled: cfg.enabled,
        maxAttempts: cfg.maxAttempts,
        attemptIndex: args.attemptIndex,
        passed,
        shouldRepeat,
        reason,
        stats: {
            total: stats.total,
            correct: stats.correct,
            accuracy,
        },
    };
}
//# sourceMappingURL=blockRepeat.js.map