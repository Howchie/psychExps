export type BinaryQuestResponse = 0 | 1;
export interface QuestBinaryStaircaseConfig {
    stimDomain: number[];
    thresholdDomain?: number[];
    slopeDomain?: number[];
    lapseDomain?: number[];
    guessRate?: number;
    priors?: {
        threshold?: number[];
        slope?: number[];
        guess?: number[];
        lapse?: number[];
    };
}
export interface QuestBinaryEstimate {
    threshold: number;
    slope: number;
    guess: number;
    lapse: number;
}
export declare class QuestBinaryStaircase {
    private readonly quest;
    private currentStimulus;
    constructor(config: QuestBinaryStaircaseConfig);
    nextStimulus(): number;
    update(response: BinaryQuestResponse): number;
    estimateMode(): QuestBinaryEstimate;
    exportPosterior(): unknown;
}
export declare function buildLinearRange(start: number, end: number, step: number): number[];
export declare function luminanceToDb(value: number): number;
export declare function dbToLuminance(value: number): number;
