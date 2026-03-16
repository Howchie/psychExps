const METRICS = ["spawned", "cleared", "dropped", "points"];
const SCOPES = new Set(["trial", "block", "experiment"]);
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0);
}
function normalizeScope(value, fallback) {
    const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
    return SCOPES.has(candidate) ? candidate : fallback;
}
function normalizeMetricList(value) {
    const items = asStringArray(value);
    if (items.length === 0)
        return METRICS.slice();
    const selected = items.filter((item) => METRICS.includes(item));
    return selected.length > 0 ? selected : METRICS.slice();
}
function emptyStats() {
    return { spawned: 0, cleared: 0, dropped: 0, points: 0 };
}
function normalizeResetRule(value) {
    const raw = asRecord(value);
    if (!raw)
        return null;
    const when = asRecord(raw.when);
    const atRaw = typeof raw.at === "string" ? raw.at.trim().toLowerCase() : "block_end";
    const at = atRaw === "block_start" ? "block_start" : "block_end";
    const scope = normalizeScope(raw.scope, "experiment");
    return {
        scope,
        metrics: normalizeMetricList(raw.metrics),
        at,
        when: {
            isPractice: typeof when?.isPractice === "boolean" ? when.isPractice : undefined,
            phaseIn: asStringArray(when?.phaseIn),
            labelIn: asStringArray(when?.labelIn),
            manipulationIdIn: asStringArray(when?.manipulationIdIn),
        },
    };
}
export function resolveBricksStatsPresentation(config) {
    const root = asRecord(config);
    const experiment = asRecord(root?.experiment);
    const raw = asRecord(experiment?.statsPresentation);
    const defaultScope = normalizeScope(raw?.defaultScope, "trial");
    const scopeByMetricRaw = asRecord(raw?.scopeByMetric);
    const scopeByMetric = {
        spawned: normalizeScope(scopeByMetricRaw?.spawned, defaultScope),
        cleared: normalizeScope(scopeByMetricRaw?.cleared, defaultScope),
        dropped: normalizeScope(scopeByMetricRaw?.dropped, defaultScope),
        points: normalizeScope(scopeByMetricRaw?.points, defaultScope),
    };
    const resetRules = [];
    if (Array.isArray(raw?.reset)) {
        for (let i = 0; i < raw.reset.length; i++) {
            const rule = normalizeResetRule(raw.reset[i]);
            if (rule) {
                resetRules.push(rule);
            }
        }
    }
    return { defaultScope, scopeByMetric, resetRules };
}
function ruleMatchesBlock(rule, block) {
    const when = rule.when;
    if (!when)
        return true;
    if (typeof when.isPractice === "boolean" && Boolean(block.isPractice) !== when.isPractice)
        return false;
    if (when.phaseIn && when.phaseIn.length > 0) {
        const phase = String(block.phase ?? "").trim();
        if (!phase || !when.phaseIn.includes(phase))
            return false;
    }
    if (when.labelIn && when.labelIn.length > 0) {
        if (!block.label || !when.labelIn.includes(block.label))
            return false;
    }
    if (when.manipulationIdIn && when.manipulationIdIn.length > 0) {
        const manipulationId = String(block.manipulationId ?? "").trim();
        if (!manipulationId || !when.manipulationIdIn.includes(manipulationId))
            return false;
    }
    return true;
}
export function createBricksStatsAccumulator() {
    return {
        block: emptyStats(),
        experiment: emptyStats(),
    };
}
export function resetAccumulatorScope(accumulator, scope, metrics) {
    if (scope === "trial")
        return;
    const target = scope === "block" ? accumulator.block : accumulator.experiment;
    const metricList = metrics && metrics.length > 0 ? metrics : METRICS;
    for (const metric of metricList) {
        target[metric] = 0;
    }
}
export function applyResetRulesAt(accumulator, presentation, at, block) {
    presentation.resetRules.forEach((rule) => {
        if ((rule.at ?? "block_end") !== at)
            return;
        if (!ruleMatchesBlock(rule, block))
            return;
        resetAccumulatorScope(accumulator, rule.scope ?? "experiment", rule.metrics);
    });
}
export function buildHudBaseStats(accumulator, presentation) {
    const out = emptyStats();
    METRICS.forEach((metric) => {
        const scope = presentation.scopeByMetric[metric] ?? presentation.defaultScope;
        out[metric] = scope === "block" ? accumulator.block[metric] : scope === "experiment" ? accumulator.experiment[metric] : 0;
    });
    return out;
}
export function addTrialStatsToAccumulator(accumulator, trialStats) {
    METRICS.forEach((metric) => {
        const value = Number(trialStats?.[metric] ?? 0);
        if (!Number.isFinite(value))
            return;
        accumulator.block[metric] += value;
        accumulator.experiment[metric] += value;
    });
}
//# sourceMappingURL=statsPresentation.js.map