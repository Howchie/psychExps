import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WaldConjugateOnlineTransform } from "./parameterTransforms";

function obs(rtMs: number) {
  return {
    timeMs: 0,
    rtMs,
    stimId: "s1",
    outcome: "hit" as const,
    key: " ",
  };
}

describe("WaldConjugateOnlineTransform t0 handling", () => {
  it("uses fixed t0 by default", () => {
    const transform = new WaldConjugateOnlineTransform({
      type: "wald_conjugate",
      minWindowSize: 2,
      maxWindowSize: 4,
      t0Mode: "fixed",
      t0: 120,
    });
    expect(transform.observe(obs(500))).toBeNull();
    const estimate = transform.observe(obs(550));
    expect(estimate?.values.t0).toBeCloseTo(120, 6);
  });

  it("supports scope-wide min-RT multiplier t0 independent of moving window", () => {
    const transform = new WaldConjugateOnlineTransform({
      type: "wald_conjugate",
      minWindowSize: 2,
      maxWindowSize: 2,
      t0Mode: "min_rt_multiplier",
      t0Multiplier: 0.5,
    });

    expect(transform.observe(obs(500))).toBeNull();
    const estimate1 = transform.observe(obs(600));
    expect(estimate1?.values.t0).toBeCloseTo(250, 6);

    const estimate2 = transform.observe(obs(800));
    expect(estimate2?.values.t0).toBeCloseTo(250, 6);

    transform.reset();
    expect(transform.observe(obs(700))).toBeNull();
    const estimate3 = transform.observe(obs(800));
    expect(estimate3?.values.t0).toBeCloseTo(350, 6);
  });

  it("accepts t0 mode/multiplier aliases from JSON-style configs", () => {
    const transform = new WaldConjugateOnlineTransform({
      type: "wald_conjugate",
      minWindowSize: 2,
      maxWindowSize: 3,
      t0mod: "min_rt_multiplier",
      t0_multiplier: 0.5,
    } as any);

    expect(transform.observe(obs(400))).toBeNull();
    const estimate = transform.observe(obs(700));
    expect(estimate?.values.t0).toBeCloseTo(200, 6);
  });

  it("matches R hybrid implementation (tmsa + mixed t0) on reference fixture", () => {
    const csvPath = resolve(process.cwd(), "src/engines/__fixtures__/wald_hybrid_reference.csv");
    const lines = readFileSync(csvPath, "utf8").trim().split("\n");
    const header = lines[0].split(",");
    const rows = lines.slice(1).map((line) => {
      const parts = line.split(",");
      const row: Record<string, number> = {};
      for (let i = 0; i < header.length; i += 1) {
        row[header[i]] = parts[i] === "" ? Number.NaN : Number(parts[i]);
      }
      return row;
    });

    const transform = new WaldConjugateOnlineTransform({
      type: "wald_conjugate",
      minWindowSize: 11,
      maxWindowSize: 50,
      t0Mode: "mix",
      t0Multiplier: 0.5,
      priors: {
        mu0: 2,
        precision0: 1,
        kappa0: 3,
        beta0: 0.4,
      },
      credibleInterval: {
        lower: 0.05,
        upper: 0.95,
      },
    });

    for (const row of rows) {
      const estimate = transform.observe(obs(row.rt));
      if (!Number.isFinite(row.drift_r)) {
        expect(estimate).toBeNull();
        continue;
      }
      expect(estimate).not.toBeNull();
      expect(estimate!.values.drift_rate).toBeCloseTo(row.drift_r, 3);
      expect(estimate!.intervals!.drift_rate.lower).toBeCloseTo(row.drift_lower_r, 3);
      expect(estimate!.intervals!.drift_rate.upper).toBeCloseTo(row.drift_upper_r, 3);
      expect(estimate!.values.threshold).toBeCloseTo(row.threshold_r, 5);
      expect(estimate!.intervals!.threshold.lower).toBeCloseTo(row.threshold_lower_r, 5);
      expect(estimate!.intervals!.threshold.upper).toBeCloseTo(row.threshold_upper_r, 5);
      expect(estimate!.values.t0).toBeCloseTo(row.t0_r, 4);
    }
  });
});
