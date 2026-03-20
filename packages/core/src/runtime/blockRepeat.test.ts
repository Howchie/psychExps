import { describe, expect, it } from "vitest";
import { coerceBlockRepeatUntilConfig, evaluateBlockRepeatUntil } from "./blockRepeat";

describe("coerceBlockRepeatUntilConfig", () => {
  it("preserves mean-metric thresholds and metricField", () => {
    const cfg = coerceBlockRepeatUntilConfig({
      enabled: true,
      maxAttempts: 3,
      maxMeanMetric: 0.25,
      minMeanMetric: 0.05,
      metrics: {
        correctField: "practice_press_results",
        metricField: "performance_deltas",
      },
    });

    expect(cfg).toMatchObject({
      enabled: true,
      maxAttempts: 3,
      maxMeanMetric: 0.25,
      minMeanMetric: 0.05,
      metrics: {
        correctField: "practice_press_results",
        metricField: "performance_deltas",
      },
    });
  });
});

describe("evaluateBlockRepeatUntil", () => {
  it("treats array-valued correct fields as per-observation totals", () => {
    const result = evaluateBlockRepeatUntil({
      config: {
        enabled: true,
        maxAttempts: 2,
        minTotal: 5,
        minAccuracy: 0.6,
        metrics: {
          correctField: "practice_press_results",
          metricField: "performance_deltas",
        },
      },
      trialResults: [
        {
          practice_press_results: [true, false, true, true, false],
          performance_deltas: [0.05, 0.12, 0.08, 0.1, 0.09],
        },
      ],
      attemptIndex: 0,
    });

    expect(result.stats.total).toBe(5);
    expect(result.stats.correct).toBe(3);
    expect(result.stats.accuracy).toBeCloseTo(0.6, 5);
    expect(result.passed).toBe(true);
    expect(result.shouldRepeat).toBe(false);
  });

  it("repeats when maxMeanMetric is exceeded", () => {
    const cfg = coerceBlockRepeatUntilConfig({
      enabled: true,
      maxAttempts: 3,
      minTotal: 5,
      maxMeanMetric: 0.25,
      metrics: {
        correctField: "practice_press_results",
        metricField: "performance_deltas",
      },
    });

    const result = evaluateBlockRepeatUntil({
      config: cfg,
      trialResults: [
        {
          practice_press_results: [false, false, false, false, false],
          performance_deltas: [-0.9, -0.8, -0.85, -0.75, -0.95],
        },
      ],
      attemptIndex: 0,
    });

    expect(result.stats.total).toBe(5);
    expect(result.stats.meanMetric).toBeGreaterThan(0.25);
    expect(result.passed).toBe(false);
    expect(result.shouldRepeat).toBe(true);
  });

  it("does not count empty arrays as completed observations", () => {
    const result = evaluateBlockRepeatUntil({
      config: {
        enabled: true,
        maxAttempts: 2,
        minTotal: 1,
        metrics: {
          correctField: "practice_press_results",
        },
      },
      trialResults: [{ practice_press_results: [] }],
      attemptIndex: 0,
    });

    expect(result.stats.total).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.shouldRepeat).toBe(true);
  });
});
