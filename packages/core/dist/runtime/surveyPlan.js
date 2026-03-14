import { asArray, asObject, asString } from "../utils/coerce";
import { resolveButtonStyleOverrides } from "../web/ui";
import { createSurveyFromPreset, runSurvey, } from "../web/surveys";
export function toSurveyDefinition(entry, fallbackId) {
    const obj = asObject(entry);
    if (!obj)
        return null;
    if (Array.isArray(obj.questions)) {
        const id = asString(obj.id) ?? fallbackId ?? "survey";
        return {
            id,
            title: asString(obj.title) ?? undefined,
            description: asString(obj.description) ?? undefined,
            showQuestionNumbers: typeof obj.showQuestionNumbers === "boolean" ? obj.showQuestionNumbers : undefined,
            showRequiredAsterisk: typeof obj.showRequiredAsterisk === "boolean" ? obj.showRequiredAsterisk : undefined,
            questionBorder: asString(obj.questionBorder) ?? undefined,
            questionBorderRadius: asString(obj.questionBorderRadius) ?? undefined,
            submitButtonStyle: resolveButtonStyleOverrides(obj.submitButtonStyle),
            autoFocusSubmitButton: typeof obj.autoFocusSubmitButton === "boolean" ? obj.autoFocusSubmitButton : undefined,
            questions: obj.questions,
            submitLabel: asString(obj.submitLabel) ?? undefined,
            computeScores: typeof obj.computeScores === "function"
                ? obj.computeScores
                : undefined,
        };
    }
    const preset = asString(obj.preset);
    if (preset === "atwit" || preset === "nasa_tlx") {
        return createSurveyFromPreset(obj);
    }
    return null;
}
export function parseSurveyDefinitions(entries) {
    return asArray(entries)
        .map((entry, index) => toSurveyDefinition(entry, `survey_${index + 1}`))
        .filter((entry) => Boolean(entry));
}
export function collectSurveyEntries(config, options = {}) {
    const out = [];
    const arrayKey = options.arrayKey ?? "postTrial";
    const singletonKey = options.singletonKey ?? "survey";
    const surveysNode = config.surveys;
    if (Array.isArray(surveysNode)) {
        out.push(...surveysNode);
    }
    else {
        const surveysObj = asObject(surveysNode);
        if (surveysObj) {
            const scoped = asArray(surveysObj[arrayKey]);
            if (scoped.length > 0)
                out.push(...scoped);
        }
    }
    if (singletonKey) {
        const single = config[singletonKey];
        if (single !== undefined && single !== null)
            out.unshift(single);
    }
    return out;
}
export async function runSurveySequence(container, surveys, buttonIdPrefix) {
    const results = [];
    for (let i = 0; i < surveys.length; i += 1) {
        const result = await runSurvey(container, surveys[i], {
            buttonId: `${buttonIdPrefix}-${i + 1}`,
        });
        results.push(result);
    }
    return results;
}
export function attachSurveyResults(record, surveys) {
    if (!Array.isArray(surveys) || surveys.length === 0)
        return record;
    return {
        ...record,
        surveys,
    };
}
export function findFirstSurveyScore(surveys, scoreKey) {
    if (!Array.isArray(surveys) || surveys.length === 0)
        return null;
    for (const survey of surveys) {
        const value = survey.scores?.[scoreKey];
        if (typeof value === "number" && Number.isFinite(value))
            return value;
    }
    return null;
}
//# sourceMappingURL=surveyPlan.js.map