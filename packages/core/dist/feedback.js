import { asObject, asString, toNonNegativeNumber, toPositiveNumber } from "./coerce";
import { resolveTemplatedString } from "./stimulus";
import { drawCenteredCanvasMessage } from "./ui";
const DEFAULT_FEEDBACK = {
    enabled: false,
    durationMs: 400,
    messages: {
        correct: "Correct",
        incorrect: "Incorrect",
        timeout: "Too slow",
        invalid: "Invalid key",
        byResponseCategory: {},
    },
    style: {
        correctColor: "#22c55e",
        incorrectColor: "#ef4444",
        timeoutColor: "#f59e0b",
        invalidColor: "#f59e0b",
        byResponseCategoryColors: {},
        fontSizePx: 28,
        fontWeight: 700,
        canvasBackground: "#000000",
        canvasBorder: "2px solid #444",
    },
};
export function parseTrialFeedbackConfig(value, fallback, defaults = {}) {
    const messages = asObject(value?.messages);
    const style = asObject(value?.style);
    const fallbackMessages = fallback?.messages ?? DEFAULT_FEEDBACK.messages;
    const fallbackStyle = fallback?.style ?? DEFAULT_FEEDBACK.style;
    return {
        enabled: value?.enabled != null ? Boolean(value.enabled) : (fallback?.enabled ?? defaults.enabled ?? DEFAULT_FEEDBACK.enabled),
        durationMs: toNonNegativeNumber(value?.duration_ms ?? value?.durationMs, fallback?.durationMs ?? defaults.durationMs ?? DEFAULT_FEEDBACK.durationMs),
        messages: {
            correct: asString(messages?.correct) || fallbackMessages.correct || defaults.messages?.correct || DEFAULT_FEEDBACK.messages.correct,
            incorrect: asString(messages?.incorrect) || fallbackMessages.incorrect || defaults.messages?.incorrect || DEFAULT_FEEDBACK.messages.incorrect,
            timeout: asString(messages?.timeout) || fallbackMessages.timeout || defaults.messages?.timeout || DEFAULT_FEEDBACK.messages.timeout,
            invalid: asString(messages?.invalid) || fallbackMessages.invalid || defaults.messages?.invalid || DEFAULT_FEEDBACK.messages.invalid,
            byResponseCategory: parseResponseCategoryMap(asObject(messages?.byResponseCategory) ?? asObject(messages?.by_response_category), fallbackMessages.byResponseCategory, defaults.messages?.byResponseCategory),
        },
        style: {
            correctColor: asString(style?.correct_color ?? style?.correctColor) || fallbackStyle.correctColor || defaults.style?.correctColor || DEFAULT_FEEDBACK.style.correctColor,
            incorrectColor: asString(style?.incorrect_color ?? style?.incorrectColor) || fallbackStyle.incorrectColor || defaults.style?.incorrectColor || DEFAULT_FEEDBACK.style.incorrectColor,
            timeoutColor: asString(style?.timeout_color ?? style?.timeoutColor) || fallbackStyle.timeoutColor || defaults.style?.timeoutColor || DEFAULT_FEEDBACK.style.timeoutColor,
            invalidColor: asString(style?.invalid_color ?? style?.invalidColor) || fallbackStyle.invalidColor || defaults.style?.invalidColor || DEFAULT_FEEDBACK.style.invalidColor,
            byResponseCategoryColors: parseResponseCategoryMap(asObject(style?.byResponseCategoryColors) ?? asObject(style?.by_response_category_colors), fallbackStyle.byResponseCategoryColors, defaults.style?.byResponseCategoryColors),
            fontSizePx: toPositiveNumber(style?.font_size_px ?? style?.fontSizePx, fallbackStyle.fontSizePx ?? defaults.style?.fontSizePx ?? DEFAULT_FEEDBACK.style.fontSizePx),
            fontWeight: toPositiveNumber(style?.font_weight ?? style?.fontWeight, fallbackStyle.fontWeight ?? defaults.style?.fontWeight ?? DEFAULT_FEEDBACK.style.fontWeight),
            canvasBackground: asString(style?.canvas_background ?? style?.canvasBackground) || fallbackStyle.canvasBackground || defaults.style?.canvasBackground || DEFAULT_FEEDBACK.style.canvasBackground,
            canvasBorder: asString(style?.canvas_border ?? style?.canvasBorder) || fallbackStyle.canvasBorder || defaults.style?.canvasBorder || DEFAULT_FEEDBACK.style.canvasBorder,
        },
    };
}
export function resolveTrialFeedbackView(args) {
    const responseCategory = String(args.responseCategory || "").trim().toLowerCase();
    const isCorrect = Number(args.correct) === 1;
    const byCategoryMessage = args.feedback.messages.byResponseCategory[responseCategory];
    const byCategoryColor = args.feedback.style.byResponseCategoryColors[responseCategory];
    let messageTemplate = byCategoryMessage;
    if (!messageTemplate) {
        if (responseCategory === "timeout") {
            messageTemplate = args.feedback.messages.timeout;
        }
        else if (responseCategory === "invalid") {
            messageTemplate = args.feedback.messages.invalid;
        }
        else {
            messageTemplate = isCorrect ? args.feedback.messages.correct : args.feedback.messages.incorrect;
        }
    }
    let color = byCategoryColor;
    if (!color) {
        if (responseCategory === "timeout") {
            color = args.feedback.style.timeoutColor;
        }
        else if (responseCategory === "invalid") {
            color = args.feedback.style.invalidColor;
        }
        else {
            color = isCorrect ? args.feedback.style.correctColor : args.feedback.style.incorrectColor;
        }
    }
    const text = resolveTemplatedString({
        template: messageTemplate,
        vars: {
            responseCategory,
            correct: isCorrect ? 1 : 0,
            ...(args.vars ?? {}),
        },
        resolver: args.resolver,
        context: args.resolverContext,
    });
    return { text, color };
}
export function drawTrialFeedbackOnCanvas(ctx, layout, feedback, view) {
    drawCenteredCanvasMessage(ctx, layout, {
        cueText: "",
        frameBackground: feedback.style.canvasBackground,
        frameBorder: feedback.style.canvasBorder,
        message: view?.text ?? "",
        messageColor: view?.color ?? feedback.style.timeoutColor,
        fontSizePx: feedback.style.fontSizePx,
        fontWeight: feedback.style.fontWeight,
    });
}
function parseResponseCategoryMap(value, fallback, defaults) {
    const out = {};
    for (const [key, entry] of Object.entries(defaults ?? {})) {
        const normalized = String(key || "").trim().toLowerCase();
        const text = asString(entry);
        if (normalized && text)
            out[normalized] = text;
    }
    for (const [key, entry] of Object.entries(fallback ?? {})) {
        const normalized = String(key || "").trim().toLowerCase();
        const text = asString(entry);
        if (normalized && text)
            out[normalized] = text;
    }
    for (const [key, entry] of Object.entries(value ?? {})) {
        const normalized = String(key || "").trim().toLowerCase();
        const text = asString(entry);
        if (normalized && text)
            out[normalized] = text;
    }
    return out;
}
//# sourceMappingURL=feedback.js.map