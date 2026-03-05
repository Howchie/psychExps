export function evaluateTrialOutcome(args) {
    const responseCategory = String(args.responseCategory || "");
    const rt = typeof args.rt === "number" && Number.isFinite(args.rt) ? args.rt : -1;
    const expectedCategory = args.expectedCategory ?? args.stimulusCategory ?? null;
    const context = {
        responseCategory,
        stimulusCategory: args.stimulusCategory ?? null,
        expectedCategory,
        rt,
        meta: args.meta,
    };
    const raw = args.evaluator ? args.evaluator(context) : defaultCorrectnessEvaluator(context);
    const normalized = normalizeCorrectnessResult(raw, expectedCategory);
    return {
        responseCategory,
        rt,
        correct: normalized.correct,
        expectedCategory: normalized.expectedCategory ?? expectedCategory,
        subtaskCorrect: normalized.subtaskCorrect,
    };
}
function defaultCorrectnessEvaluator(context) {
    if (!context.expectedCategory)
        return { correct: 0, expectedCategory: null };
    return {
        correct: context.responseCategory === context.expectedCategory ? 1 : 0,
        expectedCategory: context.expectedCategory,
    };
}
function normalizeCorrectnessResult(value, fallbackExpectedCategory) {
    if (typeof value === "boolean") {
        return { correct: value ? 1 : 0, expectedCategory: fallbackExpectedCategory };
    }
    if (typeof value === "number") {
        return { correct: value ? 1 : 0, expectedCategory: fallbackExpectedCategory };
    }
    return {
        correct: value.correct ? 1 : 0,
        expectedCategory: value.expectedCategory ?? fallbackExpectedCategory,
        subtaskCorrect: value.subtaskCorrect,
    };
}
//# sourceMappingURL=outcome.js.map