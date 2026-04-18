import { describe, expect, it } from "vitest";
import { computeBlockSummaryStats } from "./blockSummary";

describe("computeBlockSummaryStats where matching", () => {
  const trialResults = [
    { trialType: "N", responseCorrect: 1, responseRtMs: 410 },
    { trialType: "F", responseCorrect: 1, responseRtMs: 520 },
    { trialType: "L4", responseCorrect: 0, responseRtMs: 600 },
    { trialType: "L9", responseCorrect: 1, responseRtMs: 480 },
  ];

  it("supports wildcard matching via *", () => {
    const stats = computeBlockSummaryStats({
      trialResults,
      where: { trialType: ["L*"] },
      metrics: { correctField: "responseCorrect", rtField: "responseRtMs" },
    });

    expect(stats.total).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.accuracyPct).toBeCloseTo(50, 5);
  });

  it("supports regex matching via regex: prefix", () => {
    const stats = computeBlockSummaryStats({
      trialResults,
      where: { trialType: ["regex:^L[0-9]$"] },
      metrics: { correctField: "responseCorrect", rtField: "responseRtMs" },
    });

    expect(stats.total).toBe(2);
    expect(stats.correct).toBe(1);
    expect(stats.accuracyPct).toBeCloseTo(50, 5);
  });

  it("supports mixed literal and wildcard values", () => {
    const stats = computeBlockSummaryStats({
      trialResults,
      where: { trialType: ["F", "L*"] },
      metrics: { correctField: "responseCorrect", rtField: "responseRtMs" },
    });

    expect(stats.total).toBe(3);
    expect(stats.correct).toBe(2);
    expect(stats.accuracyPct).toBeCloseTo(66.666, 2);
  });
});

