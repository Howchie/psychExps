import { SeededRandom } from "@experiments/core";
export interface TrialPlanItem {
    isChange: boolean;
    setSize: number;
    blockIndex: number;
    trialIndex: number;
}
export declare function buildTrialPlan(config: any, rng: SeededRandom): TrialPlanItem[];
