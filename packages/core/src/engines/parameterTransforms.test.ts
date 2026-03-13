import { describe, expect, it } from "vitest";
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
});
