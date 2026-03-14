import { asArray, asObject, asString } from "../utils/coerce";
import { resolveButtonStyleOverrides } from "../web/ui";
import {
  createSurveyFromPreset,
  runSurvey,
  type SurveyDefinition,
  type SurveyPresetSpec,
  type SurveyRunResult,
} from "../web/surveys";

export function toSurveyDefinition(entry: unknown, fallbackId?: string): SurveyDefinition | null {
  const obj = asObject(entry);
  if (!obj) return null;
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
      questions: obj.questions as SurveyDefinition["questions"],
      submitLabel: asString(obj.submitLabel) ?? undefined,
      computeScores:
        typeof obj.computeScores === "function"
          ? (obj.computeScores as SurveyDefinition["computeScores"])
          : undefined,
    };
  }
  const preset = asString(obj.preset);
  if (preset === "atwit" || preset === "nasa_tlx") {
    return createSurveyFromPreset(obj as SurveyPresetSpec);
  }
  return null;
}

export function parseSurveyDefinitions(entries: unknown): SurveyDefinition[] {
  return asArray(entries)
    .map((entry, index) => toSurveyDefinition(entry, `survey_${index + 1}`))
    .filter((entry): entry is SurveyDefinition => Boolean(entry));
}

export function collectSurveyEntries(
  config: Record<string, unknown>,
  options: {
    arrayKey?: string;
    singletonKey?: string;
  } = {},
): unknown[] {
  const out: unknown[] = [];
  const arrayKey = options.arrayKey ?? "postTrial";
  const singletonKey = options.singletonKey ?? "survey";
  const surveysNode = config.surveys;
  if (Array.isArray(surveysNode)) {
    out.push(...surveysNode);
  } else {
    const surveysObj = asObject(surveysNode);
    if (surveysObj) {
      const scoped = asArray(surveysObj[arrayKey]);
      if (scoped.length > 0) out.push(...scoped);
    }
  }
  if (singletonKey) {
    const single = config[singletonKey];
    if (single !== undefined && single !== null) out.unshift(single);
  }
  return out;
}

export async function runSurveySequence(
  container: HTMLElement,
  surveys: SurveyDefinition[],
  buttonIdPrefix: string,
): Promise<SurveyRunResult[]> {
  const results: SurveyRunResult[] = [];
  for (let i = 0; i < surveys.length; i += 1) {
    const result = await runSurvey(container, surveys[i], {
      buttonId: `${buttonIdPrefix}-${i + 1}`,
    });
    results.push(result);
  }
  return results;
}

export function attachSurveyResults<TRecord extends Record<string, unknown>>(
  record: TRecord,
  surveys: SurveyRunResult[],
): TRecord | (TRecord & { surveys: SurveyRunResult[] }) {
  if (!Array.isArray(surveys) || surveys.length === 0) return record;
  return {
    ...record,
    surveys,
  };
}

export function findFirstSurveyScore(
  surveys: SurveyRunResult[],
  scoreKey: string,
): number | null {
  if (!Array.isArray(surveys) || surveys.length === 0) return null;
  for (const survey of surveys) {
    const value = survey.scores?.[scoreKey];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
