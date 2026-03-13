import { isAutoResponderEnabled, sampleAutoContinueDelayMs } from "../runtime/autoresponder";
import { applyButtonStyleOverrides, escapeHtml, sleep } from "./ui";
export async function runSurvey(container, survey, options = {}) {
    const startedAt = Date.now();
    const buttonId = options.buttonId ?? `exp-survey-submit-${sanitizeId(survey.id)}`;
    const rootClass = options.className ?? "exp-survey-screen";
    container.innerHTML = buildSurveyHtml(survey, buttonId, rootClass);
    hydrateSurveyInteractions(container, survey);
    const submitButton = container.querySelector(`#${buttonId}`);
    if (!(submitButton instanceof HTMLButtonElement)) {
        throw new Error(`Survey submit button missing: ${buttonId}`);
    }
    applyButtonStyleOverrides(submitButton, options.submitButtonStyle ?? survey.submitButtonStyle);
    const answers = await waitForSurveySubmit(container, survey, submitButton, options.autoFocusSubmitButton ?? survey.autoFocusSubmitButton);
    const completedAt = Date.now();
    const scores = survey.computeScores?.(answers);
    return {
        surveyId: survey.id,
        surveyTitle: survey.title ?? null,
        startedAtIso: new Date(startedAt).toISOString(),
        completedAtIso: new Date(completedAt).toISOString(),
        durationMs: Math.max(0, completedAt - startedAt),
        answers,
        ...(scores ? { scores } : {}),
    };
}
function waitForSurveySubmit(container, survey, submitButton, autoFocusSubmitButton) {
    return new Promise((resolve) => {
        const errors = container.querySelector('[data-exp-survey-errors]');
        const errorsNode = errors instanceof HTMLElement ? errors : null;
        const complete = () => {
            const answers = collectSurveyAnswers(container, survey);
            const missingPrompts = survey.questions
                .filter((q) => q.required !== false)
                .filter((q) => answers[q.id] === null)
                .map((q) => q.prompt);
            if (missingPrompts.length > 0) {
                if (errorsNode) {
                    errorsNode.style.display = "block";
                    errorsNode.innerHTML = `<p style="margin:0 0 0.25rem 0;"><strong>Please answer all required questions.</strong></p>${missingPrompts
                        .map((text) => `<div>${escapeHtml(text)}</div>`)
                        .join("")}`;
                }
                return;
            }
            cleanup();
            resolve(answers);
        };
        const onClick = () => complete();
        const onKey = (event) => {
            if (event.key !== "Enter")
                return;
            const target = event.target;
            if (target instanceof HTMLTextAreaElement)
                return;
            complete();
        };
        const cleanup = () => {
            submitButton.removeEventListener("click", onClick);
            window.removeEventListener("keydown", onKey);
        };
        submitButton.addEventListener("click", onClick);
        window.addEventListener("keydown", onKey);
        if (autoFocusSubmitButton !== false) {
            submitButton.focus();
        }
        if (isAutoResponderEnabled()) {
            const autoAnswers = autoFillSurvey(container, survey);
            if (autoAnswers > 0) {
                void (async () => {
                    const delay = sampleAutoContinueDelayMs() ?? 0;
                    await sleep(delay);
                    complete();
                })();
            }
        }
    });
}
function autoFillSurvey(container, survey) {
    let count = 0;
    for (const question of survey.questions) {
        if (question.type === "single_choice") {
            const first = question.options[0];
            if (!first)
                continue;
            const selector = `input[name="${cssEscape(surveyQuestionInputName(question.id))}"][value="${cssEscape(String(first.value))}"]`;
            const input = container.querySelector(selector);
            if (input instanceof HTMLInputElement) {
                input.checked = true;
                count += 1;
            }
            continue;
        }
        if (question.type === "slider") {
            const input = container.querySelector(`#${sliderInputId(question.id)}`);
            if (!(input instanceof HTMLInputElement))
                continue;
            const min = Math.min(question.min, question.max);
            const max = Math.max(question.min, question.max);
            const midpoint = min + (max - min) / 2;
            const value = Number.isFinite(question.initial) ? Number(question.initial) : midpoint;
            input.value = String(Math.round(value));
            syncSliderValueLabel(container, question.id);
            count += 1;
        }
    }
    return count;
}
function collectSurveyAnswers(container, survey) {
    const answers = {};
    for (const question of survey.questions) {
        if (question.type === "single_choice") {
            const selected = container.querySelector(`input[name="${cssEscape(surveyQuestionInputName(question.id))}"]:checked`);
            if (!(selected instanceof HTMLInputElement)) {
                answers[question.id] = null;
                continue;
            }
            const value = selected.value;
            answers[question.id] = parseStringNumber(value);
            continue;
        }
        const slider = container.querySelector(`#${sliderInputId(question.id)}`);
        if (!(slider instanceof HTMLInputElement)) {
            answers[question.id] = null;
            continue;
        }
        answers[question.id] = Number(slider.value);
    }
    return answers;
}
function hydrateSurveyInteractions(container, survey) {
    for (const question of survey.questions) {
        if (question.type !== "slider")
            continue;
        const slider = container.querySelector(`#${sliderInputId(question.id)}`);
        if (!(slider instanceof HTMLInputElement))
            continue;
        const update = () => syncSliderValueLabel(container, question.id);
        slider.addEventListener("input", update);
        slider.addEventListener("change", update);
        syncSliderValueLabel(container, question.id);
    }
}
function syncSliderValueLabel(container, questionId) {
    const slider = container.querySelector(`#${sliderInputId(questionId)}`);
    const valueNode = container.querySelector(`#${sliderValueId(questionId)}`);
    if (!(slider instanceof HTMLInputElement) || !(valueNode instanceof HTMLElement))
        return;
    valueNode.textContent = slider.value;
}
function buildSurveyHtml(survey, buttonId, rootClass) {
    const title = survey.title ? `<h2 style="margin:0 0 0.75rem 0;">${escapeHtml(survey.title)}</h2>` : "";
    const description = survey.description ? `<p style="margin:0 0 1rem 0;">${escapeHtml(survey.description)}</p>` : "";
    const showQuestionNumbers = survey.showQuestionNumbers !== false;
    const showRequiredAsterisk = survey.showRequiredAsterisk !== false;
    const questionBorder = resolveInlineStyleValue(survey.questionBorder, "1px solid #e5e7eb");
    const questionBorderRadius = resolveInlineStyleValue(survey.questionBorderRadius, "8px");
    const questionsHtml = survey.questions
        .map((question, index) => renderQuestion(question, index + 1, showQuestionNumbers, showRequiredAsterisk, questionBorder, questionBorderRadius))
        .join("");
    const submitLabel = escapeHtml(survey.submitLabel ?? "Submit");
    return `<section class="${escapeHtml(rootClass)}" style="width:100%;min-height:70vh;display:flex;align-items:center;justify-content:center;"><div style="width:min(900px,96vw);padding:1rem 1.25rem;">${title}${description}<div data-exp-survey-errors style="display:none;margin:0 0 1rem 0;padding:0.6rem 0.75rem;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;"></div>${questionsHtml}<p style="margin:1rem 0 0 0;"><button id="${escapeHtml(buttonId)}" type="button">${submitLabel}</button></p></div></section>`;
}
function renderQuestion(question, index, showQuestionNumbers, showRequiredAsterisk, questionBorder, questionBorderRadius) {
    const required = question.required !== false;
    const star = required && showRequiredAsterisk ? " <span aria-hidden=\"true\" style=\"color:#b91c1c;\">*</span>" : "";
    const promptPrefix = showQuestionNumbers ? `${index}. ` : "";
    const prompt = `<p style="margin:0 0 0.5rem 0;font-weight:600;">${promptPrefix}${escapeHtml(question.prompt)}${star}</p>`;
    const help = question.helpText ? `<p style="margin:0 0 0.6rem 0;color:#374151;">${escapeHtml(question.helpText)}</p>` : "";
    const inner = question.type === "single_choice" ? renderSingleChoice(question) : renderSlider(question);
    const legend = showQuestionNumbers ? `<legend style="padding:0 0.3rem;">Q${index}</legend>` : "";
    return `<fieldset style="margin:0 0 1rem 0;padding:0.75rem 0.85rem;border:${questionBorder};border-radius:${questionBorderRadius};">${legend}${prompt}${help}${inner}</fieldset>`;
}
function renderSingleChoice(question) {
    const isHorizontal = question.layout !== "vertical";
    const direction = isHorizontal ? "row" : "column";
    const options = question.options
        .map((option, index) => {
        const id = `${sanitizeId(question.id)}-opt-${index + 1}`;
        return `<label for="${id}" style="display:inline-flex;align-items:center;gap:0.35rem;margin-right:0.8rem;"><input id="${id}" type="radio" name="${escapeHtml(surveyQuestionInputName(question.id))}" value="${escapeHtml(String(option.value))}" /><span>${escapeHtml(option.label)}</span></label>`;
    })
        .join("");
    return `<div style="display:flex;flex-direction:${direction};gap:0.45rem;">${options}</div>`;
}
function renderSlider(question) {
    const min = Math.min(question.min, question.max);
    const max = Math.max(question.min, question.max);
    const step = Number.isFinite(question.step) ? Math.max(0.0001, Math.abs(Number(question.step))) : 1;
    const initialRaw = Number.isFinite(question.initial) ? Number(question.initial) : min + (max - min) / 2;
    const initial = Math.max(min, Math.min(max, initialRaw));
    const showValue = question.showValue !== false;
    const minLabel = question.minLabel ? `<span>${escapeHtml(question.minLabel)}</span>` : "<span></span>";
    const maxLabel = question.maxLabel ? `<span>${escapeHtml(question.maxLabel)}</span>` : "<span></span>";
    const value = showValue ? `<div style="margin:0.3rem 0 0 0;color:#111827;">Value: <strong id="${sliderValueId(question.id)}">${Math.round(initial)}</strong></div>` : "";
    return `<div><input id="${sliderInputId(question.id)}" type="range" min="${min}" max="${max}" step="${step}" value="${initial}" style="width:100%;" /><div style="display:flex;justify-content:space-between;color:#4b5563;margin-top:0.2rem;">${minLabel}${maxLabel}</div>${value}</div>`;
}
function sanitizeId(input) {
    const output = String(input || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
    return output || "item";
}
function parseStringNumber(raw) {
    const value = raw.trim();
    if (value === "")
        return "";
    const parsed = Number(value);
    if (Number.isFinite(parsed) && String(parsed) === value)
        return parsed;
    return value;
}
function surveyQuestionInputName(questionId) {
    return `survey_${sanitizeId(questionId)}`;
}
function sliderInputId(questionId) {
    return `survey_${sanitizeId(questionId)}_slider`;
}
function sliderValueId(questionId) {
    return `survey_${sanitizeId(questionId)}_value`;
}
function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
}
const NASA_SUBSCALES = [
    {
        id: "mental_demand",
        label: "Mental Demand",
        prompt: "How mentally demanding was the task?",
        minLabel: "Very Low",
        maxLabel: "Very High",
    },
    {
        id: "physical_demand",
        label: "Physical Demand",
        prompt: "How physically demanding was the task?",
        minLabel: "Very Low",
        maxLabel: "Very High",
    },
    {
        id: "temporal_demand",
        label: "Temporal Demand",
        prompt: "How hurried or rushed was the pace of the task?",
        minLabel: "Very Low",
        maxLabel: "Very High",
    },
    {
        id: "performance",
        label: "Performance",
        prompt: "How successful were you in accomplishing what you were asked to do?",
        minLabel: "Perfect",
        maxLabel: "Failure",
    },
    {
        id: "effort",
        label: "Effort",
        prompt: "How hard did you have to work to accomplish your level of performance?",
        minLabel: "Very Low",
        maxLabel: "Very High",
    },
    {
        id: "frustration",
        label: "Frustration",
        prompt: "How insecure, discouraged, irritated, stressed, and annoyed were you?",
        minLabel: "Very Low",
        maxLabel: "Very High",
    },
];
export function createAtwitSurvey(options = {}) {
    const min = Number.isFinite(options.min) ? Math.max(1, Math.floor(Number(options.min))) : 1;
    const maxRaw = Number.isFinite(options.max) ? Math.floor(Number(options.max)) : 10;
    const max = Math.max(min, maxRaw);
    const questionId = "atwit";
    return {
        id: options.id ?? "atwit",
        title: options.title ?? "Workload Rating",
        showQuestionNumbers: options.showQuestionNumbers,
        showRequiredAsterisk: options.showRequiredAsterisk,
        questionBorder: options.questionBorder,
        questionBorderRadius: options.questionBorderRadius,
        questions: [
            {
                id: questionId,
                type: "single_choice",
                prompt: options.prompt ?? "ATWIT: Rate your overall workload during the just-completed trial (1-10).",
                required: options.required !== false,
                layout: "horizontal",
                options: Array.from({ length: max - min + 1 }, (_, idx) => {
                    const value = min + idx;
                    return { value, label: String(value) };
                }),
            },
        ],
        submitLabel: "Continue",
        submitButtonStyle: options.submitButtonStyle,
        autoFocusSubmitButton: options.autoFocusSubmitButton,
        computeScores: (answers) => {
            const value = answers[questionId];
            if (typeof value !== "number")
                return undefined;
            return { overall: value };
        },
    };
}
export function createNasaTlxSurvey(options = {}) {
    const selectedSubscales = resolveNasaSubscales(options.subscales);
    const min = Number.isFinite(options.min) ? Number(options.min) : 1;
    const max = Number.isFinite(options.max) ? Number(options.max) : 100;
    const step = Number.isFinite(options.step) ? Number(options.step) : 1;
    const defaultInitial = Number.isFinite(options.initial) ? Number(options.initial) : min + (max - min) / 2;
    return {
        id: options.id ?? "nasa_tlx",
        title: options.title ?? "NASA TLX",
        description: options.description,
        showQuestionNumbers: options.showQuestionNumbers,
        showRequiredAsterisk: options.showRequiredAsterisk,
        questionBorder: options.questionBorder,
        questionBorderRadius: options.questionBorderRadius,
        questions: selectedSubscales.map((subscale) => ({
            id: subscale.id,
            type: "slider",
            prompt: subscale.prompt,
            helpText: subscale.label,
            min,
            max,
            step,
            initial: defaultInitial,
            minLabel: subscale.minLabel,
            maxLabel: subscale.maxLabel,
            showValue: options.showValue !== false,
            required: options.required !== false,
        })),
        submitLabel: "Continue",
        submitButtonStyle: options.submitButtonStyle,
        autoFocusSubmitButton: options.autoFocusSubmitButton,
        computeScores: (answers) => {
            const numericValues = selectedSubscales
                .map((subscale) => answers[subscale.id])
                .filter((value) => typeof value === "number" && Number.isFinite(value));
            if (numericValues.length === 0)
                return undefined;
            const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
            return { raw_tlx: Number(average.toFixed(3)) };
        },
    };
}
function resolveNasaSubscales(subscales) {
    if (!Array.isArray(subscales) || subscales.length === 0)
        return NASA_SUBSCALES.slice();
    const byId = new Map(NASA_SUBSCALES.map((entry) => [entry.id, entry]));
    const resolved = [];
    for (const id of subscales) {
        const entry = byId.get(id);
        if (entry)
            resolved.push(entry);
    }
    return resolved.length > 0 ? resolved : NASA_SUBSCALES.slice();
}
function resolveInlineStyleValue(raw, fallback) {
    const value = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;
    return escapeHtml(value);
}
export function createSurveyFromPreset(spec) {
    if (spec.preset === "atwit") {
        return createAtwitSurvey(spec);
    }
    return createNasaTlxSurvey(spec);
}
//# sourceMappingURL=surveys.js.map