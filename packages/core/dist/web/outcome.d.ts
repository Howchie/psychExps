export interface CorrectnessResult {
    correct: 0 | 1;
    expectedCategory?: string | null;
    subtaskCorrect?: Record<string, 0 | 1>;
}
export interface CorrectnessContext {
    responseCategory: string;
    stimulusCategory?: string | null;
    expectedCategory?: string | null;
    rt: number;
    meta?: Record<string, unknown>;
}
export type CorrectnessEvaluator = (context: CorrectnessContext) => CorrectnessResult | boolean | number;
export interface EvaluateTrialOutcomeArgs {
    responseCategory: string;
    rt: number | null;
    stimulusCategory?: string | null;
    expectedCategory?: string | null;
    meta?: Record<string, unknown>;
    evaluator?: CorrectnessEvaluator;
}
export interface TrialOutcome {
    responseCategory: string;
    rt: number;
    correct: 0 | 1;
    expectedCategory?: string | null;
    subtaskCorrect?: Record<string, 0 | 1>;
}
export declare function evaluateTrialOutcome(args: EvaluateTrialOutcomeArgs): TrialOutcome;
