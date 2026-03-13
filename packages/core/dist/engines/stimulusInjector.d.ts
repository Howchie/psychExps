import type { TaskModule, TaskModuleHandle, TaskModuleAddress, TaskModuleContext } from "../api/taskModule";
import { type ProspectiveMemoryScheduleConfig } from "./prospectiveMemory";
import { type PoolDrawConfig } from "../infrastructure/pools";
export interface StimulusInjectionCategorySource {
    type: "category_in";
    categories: string[];
}
export interface StimulusInjectionLiteralSource {
    type: "literal";
    items: string[];
    sourceCategory?: string;
}
export type StimulusInjectionSource = StimulusInjectionCategorySource | StimulusInjectionLiteralSource;
export interface StimulusInjectionSourceDrawConfig {
    mode?: PoolDrawConfig["mode"];
    scope?: "block" | "participant";
    shuffle?: boolean;
}
export interface StimulusInjectionSetters {
    trialType?: string;
    itemCategory?: string;
    correctResponse?: string;
    responseCategory?: string;
}
export interface StimulusInjectionSpec {
    id?: string;
    enabled?: boolean;
    schedule: ProspectiveMemoryScheduleConfig;
    eligibleTrialTypes?: string[];
    source: StimulusInjectionSource;
    sourceDraw?: StimulusInjectionSourceDrawConfig;
    set?: StimulusInjectionSetters;
}
export interface StimulusInjectorModuleConfig {
    enabled: boolean;
    injections: StimulusInjectionSpec[];
}
export interface StimulusInjectorModuleResult {
    applied: Array<{
        id: string;
        positions: number[];
        blockIndex?: number;
    }>;
}
export declare class StimulusInjectorModule implements TaskModule<StimulusInjectorModuleConfig, StimulusInjectorModuleResult> {
    readonly id = "injector";
    private participantScopedDrawers;
    transformBlockPlan(block: any, config: StimulusInjectorModuleConfig, context: TaskModuleContext): any;
    getModularSemantics(config: StimulusInjectorModuleConfig): Record<string, string | string[]>;
    start(_config: StimulusInjectorModuleConfig, _address: TaskModuleAddress, _context: TaskModuleContext): TaskModuleHandle<StimulusInjectorModuleResult>;
    private applyInjection;
    private createDrawerWithConfig;
    private coerceSourceDrawConfig;
    private makeParticipantScopedDrawerId;
    private collectCandidates;
}
