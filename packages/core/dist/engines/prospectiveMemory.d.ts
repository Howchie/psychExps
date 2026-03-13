import { SeededRandom } from "../infrastructure/random";
import type { TaskModule, TaskModuleHandle, TaskModuleAddress, TaskModuleContext } from "../api/taskModule";
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
export interface ProspectiveMemoryModuleConfig {
    enabled: boolean;
    schedule: ProspectiveMemoryScheduleConfig;
    rules: ProspectiveMemoryCueRule[];
    eligibleTrialTypes?: string[];
    captureResponses?: boolean;
}
export interface ProspectiveMemoryModuleResult {
    responses: Array<{
        key: string;
        timestamp: number;
    }>;
}
export declare class ProspectiveMemoryModule implements TaskModule<ProspectiveMemoryModuleConfig, ProspectiveMemoryModuleResult> {
    readonly id = "pm";
    transformBlockPlan(block: any, config: ProspectiveMemoryModuleConfig, context: TaskModuleContext): any;
    getModularSemantics(config: ProspectiveMemoryModuleConfig): Record<string, string | string[]>;
    start(_config: ProspectiveMemoryModuleConfig, _address: TaskModuleAddress, _context: TaskModuleContext): TaskModuleHandle<ProspectiveMemoryModuleResult>;
}
export declare function generateProspectiveMemoryPositions(rng: SeededRandom, nTrials: number, schedule: ProspectiveMemoryScheduleConfig, eligibleIndices?: Set<number>): number[];
export declare function resolveProspectiveMemoryCueMatch(context: ProspectiveMemoryCueContext, rules: ProspectiveMemoryCueRule[]): ProspectiveMemoryCueMatch;
