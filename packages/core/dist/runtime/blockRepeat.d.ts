import { type BlockSummaryWhere } from "./blockSummary";
export interface BlockRepeatMetricSpec {
    correctField: string;
}
export interface BlockRepeatUntilConfig {
    enabled: boolean;
    maxAttempts: number;
    minAccuracy?: number;
    minCorrect?: number;
    minTotal?: number;
    where?: BlockSummaryWhere;
    metrics: BlockRepeatMetricSpec;
}
export interface BlockRepeatEvaluation {
    enabled: boolean;
    maxAttempts: number;
    attemptIndex: number;
    passed: boolean;
    shouldRepeat: boolean;
    reason: "disabled" | "max_attempts_reached" | "threshold_not_met" | "threshold_met";
    stats: {
        total: number;
        correct: number;
        accuracy: number;
    };
}
export declare function coerceBlockRepeatUntilConfig(value: unknown): BlockRepeatUntilConfig | null;
export declare function evaluateBlockRepeatUntil(args: {
    config: BlockRepeatUntilConfig | null;
    trialResults: unknown[];
    attemptIndex: number;
}): BlockRepeatEvaluation;
