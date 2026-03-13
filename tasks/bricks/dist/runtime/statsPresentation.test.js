import { describe, expect, it } from "vitest";
import { addTrialStatsToAccumulator, applyResetRulesAt, buildHudBaseStats, createBricksStatsAccumulator, resolveBricksStatsPresentation, } from "./statsPresentation";
describe("statsPresentation", () => {
    it("uses trial scope by default", () => {
        const presentation = resolveBricksStatsPresentation({});
        const accumulator = createBricksStatsAccumulator();
        addTrialStatsToAccumulator(accumulator, { points: 10, cleared: 2, dropped: 1, spawned: 3 });
        const base = buildHudBaseStats(accumulator, presentation);
        expect(base).toEqual({ points: 0, cleared: 0, dropped: 0, spawned: 0 });
    });
    it("supports split scopes per metric", () => {
        const presentation = resolveBricksStatsPresentation({
            experiment: {
                statsPresentation: {
                    defaultScope: "trial",
                    scopeByMetric: {
                        points: "experiment",
                        cleared: "trial",
                        dropped: "trial",
                        spawned: "block",
                    },
                },
            },
        });
        const accumulator = createBricksStatsAccumulator();
        addTrialStatsToAccumulator(accumulator, { points: 11, cleared: 2, dropped: 1, spawned: 3 });
        const base = buildHudBaseStats(accumulator, presentation);
        expect(base.points).toBe(11);
        expect(base.spawned).toBe(3);
        expect(base.cleared).toBe(0);
        expect(base.dropped).toBe(0);
    });
    it("can reset experiment points after practice block", () => {
        const presentation = resolveBricksStatsPresentation({
            experiment: {
                statsPresentation: {
                    defaultScope: "trial",
                    scopeByMetric: { points: "experiment" },
                    reset: [
                        {
                            at: "block_end",
                            scope: "experiment",
                            metrics: ["points"],
                            when: { isPractice: true },
                        },
                    ],
                },
            },
        });
        const accumulator = createBricksStatsAccumulator();
        addTrialStatsToAccumulator(accumulator, { points: 30, cleared: 4 });
        applyResetRulesAt(accumulator, presentation, "block_end", {
            label: "Practice",
            isPractice: true,
            phase: "practice",
        });
        const base = buildHudBaseStats(accumulator, presentation);
        expect(base.points).toBe(0);
        expect(accumulator.experiment.cleared).toBe(4);
    });
});
//# sourceMappingURL=statsPresentation.test.js.map