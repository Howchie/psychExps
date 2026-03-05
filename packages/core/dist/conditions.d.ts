import type { RNG } from "./scheduler";
export interface ConditionFactor {
    name: string;
    levels: Array<string | number>;
}
export interface ConditionCell {
    id: string;
    levels: Record<string, string>;
}
export interface ConditionAdjacencyRules {
    maxRunLengthByFactor?: Record<string, number>;
    maxRunLengthByCell?: number;
    noImmediateRepeatFactors?: string[];
}
export interface BuildConditionSequenceArgs {
    factors: ConditionFactor[];
    trialCount: number;
    rng?: RNG;
    cellWeights?: Record<string, number>;
    adjacency?: ConditionAdjacencyRules;
    maxAttempts?: number;
}
export declare function createConditionCellId(levels: Record<string, string>): string;
export declare function enumerateConditionCells(factors: ConditionFactor[]): ConditionCell[];
export declare function buildConditionSequence(args: BuildConditionSequenceArgs): ConditionCell[];
