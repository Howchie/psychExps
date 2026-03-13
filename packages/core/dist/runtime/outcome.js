import { normalizeKey } from "../infrastructure/keys";
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
    let raw = args.evaluator ? args.evaluator(context) : defaultCorrectnessEvaluator(context);
    // Modular fallback: if not correct semantically, check for literal key match
    // This is for cases where a module (e.g. PM) has injected a literal response key 
    // that is not in the host task's semantic mapping.
    if (isIncorrect(raw)) {
        const literalKey = String(args.meta?.correctResponse ?? "");
        const actualKey = String(args.meta?.responseKey ?? "");
        if (literalKey && actualKey && normalizeKey(literalKey) === normalizeKey(actualKey)) {
            raw = { correct: 1, expectedCategory: literalKey };
        }
    }
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
function isIncorrect(result) {
    if (typeof result === "boolean")
        return !result;
    if (typeof result === "number")
        return result !== 1;
    return result.correct !== 1;
}
//# sourceMappingURL=outcome.js.map