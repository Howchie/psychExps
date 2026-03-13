export type BricksStatMetric = "spawned" | "cleared" | "dropped" | "points";
export type BricksStatScope = "trial" | "block" | "experiment";
export type BricksResetAt = "block_start" | "block_end";
export interface BricksBlockMeta {
    label: string;
    manipulationId?: string | null;
    phase?: string | null;
    isPractice?: boolean;
}
export interface BricksStatsPresentationRule {
    scope?: BricksStatScope;
    metrics?: BricksStatMetric[];
    at?: BricksResetAt;
    when?: {
        isPractice?: boolean;
        phaseIn?: string[];
        labelIn?: string[];
        manipulationIdIn?: string[];
    };
}
export interface BricksStatsPresentationConfig {
    defaultScope: BricksStatScope;
    scopeByMetric: Record<BricksStatMetric, BricksStatScope>;
    resetRules: BricksStatsPresentationRule[];
}
export interface BricksStatsAccumulator {
    block: Record<BricksStatMetric, number>;
    experiment: Record<BricksStatMetric, number>;
}
export declare function resolveBricksStatsPresentation(config: unknown): BricksStatsPresentationConfig;
export declare function createBricksStatsAccumulator(): BricksStatsAccumulator;
export declare function resetAccumulatorScope(accumulator: BricksStatsAccumulator, scope: BricksStatScope, metrics?: BricksStatMetric[]): void;
export declare function applyResetRulesAt(accumulator: BricksStatsAccumulator, presentation: BricksStatsPresentationConfig, at: BricksResetAt, block: BricksBlockMeta): void;
export declare function buildHudBaseStats(accumulator: BricksStatsAccumulator, presentation: BricksStatsPresentationConfig): Record<BricksStatMetric, number>;
export declare function addTrialStatsToAccumulator(accumulator: BricksStatsAccumulator, trialStats: Record<string, unknown> | null | undefined): void;
