import { type SurveyDefinition, type SurveyRunResult } from "../web/surveys";
export declare function toSurveyDefinition(entry: unknown, fallbackId?: string): SurveyDefinition | null;
export declare function parseSurveyDefinitions(entries: unknown): SurveyDefinition[];
export declare function collectSurveyEntries(config: Record<string, unknown>, options?: {
    arrayKey?: string;
    singletonKey?: string;
}): unknown[];
export declare function runSurveySequence(container: HTMLElement, surveys: SurveyDefinition[], buttonIdPrefix: string): Promise<SurveyRunResult[]>;
export declare function attachSurveyResults<TRecord extends Record<string, unknown>>(record: TRecord, surveys: SurveyRunResult[]): TRecord | (TRecord & {
    surveys: SurveyRunResult[];
});
export declare function findFirstSurveyScore(surveys: SurveyRunResult[], scoreKey: string): number | null;
