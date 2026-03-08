export type SurveyAnswerValue = string | number | null;
export type SurveyAnswerMap = Record<string, SurveyAnswerValue>;
export interface SurveyOption {
    value: string | number;
    label: string;
}
export interface SurveyQuestionBase {
    id: string;
    prompt: string;
    required?: boolean;
    helpText?: string;
}
export interface SurveySingleChoiceQuestion extends SurveyQuestionBase {
    type: "single_choice";
    options: SurveyOption[];
    layout?: "horizontal" | "vertical";
}
export interface SurveySliderQuestion extends SurveyQuestionBase {
    type: "slider";
    min: number;
    max: number;
    step?: number;
    initial?: number;
    minLabel?: string;
    maxLabel?: string;
    showValue?: boolean;
}
export type SurveyQuestion = SurveySingleChoiceQuestion | SurveySliderQuestion;
export interface SurveyDefinition {
    id: string;
    title?: string;
    description?: string;
    showQuestionNumbers?: boolean;
    showRequiredAsterisk?: boolean;
    questions: SurveyQuestion[];
    submitLabel?: string;
    computeScores?: (answers: SurveyAnswerMap) => Record<string, number> | undefined;
}
export interface SurveyRunResult {
    surveyId: string;
    surveyTitle: string | null;
    startedAtIso: string;
    completedAtIso: string;
    durationMs: number;
    answers: SurveyAnswerMap;
    scores?: Record<string, number>;
}
export interface RunSurveyOptions {
    buttonId?: string;
    className?: string;
}
export declare function runSurvey(container: HTMLElement, survey: SurveyDefinition, options?: RunSurveyOptions): Promise<SurveyRunResult>;
export type NasaTlxSubscaleId = "mental_demand" | "physical_demand" | "temporal_demand" | "performance" | "effort" | "frustration";
export interface AtwitSurveyOptions {
    id?: string;
    title?: string;
    prompt?: string;
    min?: number;
    max?: number;
    showQuestionNumbers?: boolean;
    showRequiredAsterisk?: boolean;
    required?: boolean;
}
export declare function createAtwitSurvey(options?: AtwitSurveyOptions): SurveyDefinition;
export interface NasaTlxSurveyOptions {
    id?: string;
    title?: string;
    description?: string;
    subscales?: NasaTlxSubscaleId[];
    min?: number;
    max?: number;
    step?: number;
    initial?: number;
    showQuestionNumbers?: boolean;
    showRequiredAsterisk?: boolean;
    showValue?: boolean;
    required?: boolean;
}
export declare function createNasaTlxSurvey(options?: NasaTlxSurveyOptions): SurveyDefinition;
export type SurveyPresetSpec = {
    preset: "atwit";
    id?: string;
    title?: string;
    prompt?: string;
    min?: number;
    max?: number;
    showQuestionNumbers?: boolean;
    showRequiredAsterisk?: boolean;
    required?: boolean;
} | {
    preset: "nasa_tlx";
    id?: string;
    title?: string;
    description?: string;
    subscales?: NasaTlxSubscaleId[];
    min?: number;
    max?: number;
    step?: number;
    initial?: number;
    showQuestionNumbers?: boolean;
    showRequiredAsterisk?: boolean;
    showValue?: boolean;
    required?: boolean;
};
export declare function createSurveyFromPreset(spec: SurveyPresetSpec): SurveyDefinition;
