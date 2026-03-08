import { describe, it, expect } from "vitest";
import { buildTrialPlan } from "./planner";
import { SeededRandom, hashSeed } from "@experiments/core";
describe("Change Detection Planner", () => {
    const rng = new SeededRandom(hashSeed("test"));
    it("should generate the correct number of change and no-change trials", () => {
        const config = {
            plan: {
                blocks: [
                    {
                        trials: 100,
                        changeProbability: 0.5,
                        setSizes: [4, 6],
                    }
                ]
            }
        };
        const plan = buildTrialPlan(config, rng);
        const changeTrials = plan.filter(t => t.isChange);
        const noChangeTrials = plan.filter(t => !t.isChange);
        expect(plan).toHaveLength(100);
        // With 100 trials and 0.5 prob, it should be exactly 50/50 if using exact quotas
        expect(changeTrials).toHaveLength(50);
        expect(noChangeTrials).toHaveLength(50);
    });
    it("should distribute set sizes correctly", () => {
        const config = {
            plan: {
                blocks: [
                    {
                        trials: 10,
                        changeProbability: 0.5,
                        setSizes: [4, 8],
                    }
                ]
            }
        };
        const plan = buildTrialPlan(config, rng);
        const setSize4 = plan.filter(t => t.setSize === 4);
        const setSize8 = plan.filter(t => t.setSize === 8);
        expect(setSize4.length).toBeGreaterThan(0);
        expect(setSize8.length).toBeGreaterThan(0);
        expect(setSize4.length + setSize8.length).toBe(10);
    });
});
//# sourceMappingURL=planner.test.js.map