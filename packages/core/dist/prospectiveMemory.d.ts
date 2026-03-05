import { SeededRandom } from "./random";
export interface ProspectiveMemoryScheduleConfig {
    count: number;
    minSeparation: number;
    maxSeparation: number;
}
export interface ProspectiveMemoryCueContext {
    category?: string | null;
    stimulusText?: string | null;
    stimulusColor?: string | null;
    flags?: Record<string, unknown>;
}
export type ProspectiveMemoryCueRule = {
    type: "category_in";
    categories: string[];
    responseKey: string;
    id?: string;
} | {
    type: "text_starts_with";
    prefixes: string[];
    responseKey: string;
    caseSensitive?: boolean;
    id?: string;
} | {
    type: "stimulus_color";
    colors: string[];
    responseKey: string;
    caseSensitive?: boolean;
    id?: string;
} | {
    type: "flag_equals";
    flag: string;
    value: string | number | boolean | null;
    responseKey: string;
    id?: string;
};
export interface ProspectiveMemoryCueMatch {
    matched: boolean;
    responseKey: string | null;
    ruleId: string | null;
}
export declare function generateProspectiveMemoryPositions(rng: SeededRandom, nTrials: number, schedule: ProspectiveMemoryScheduleConfig): number[];
export declare function resolveProspectiveMemoryCueMatch(context: ProspectiveMemoryCueContext, rules: ProspectiveMemoryCueRule[]): ProspectiveMemoryCueMatch;
