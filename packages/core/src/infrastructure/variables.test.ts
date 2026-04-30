import { describe, expect, it } from "vitest";
import { createVariableResolver } from "./variables";

describe("createVariableResolver interpolation", () => {
  it("interpolates var tokens inside strings", () => {
    const resolver = createVariableResolver({
      variables: {
        pmCategory: "animals",
      },
    });
    expect(resolver.resolveInValue("${var.pmCategory}_controls")).toBe("animals_controls");
  });

  it("interpolates namespace tokens inside strings", () => {
    const resolver = createVariableResolver({
      variables: {
        between: { pm: "instruments" },
      },
    });
    expect(resolver.resolveInValue("${between.pm}_controls")).toBe("instruments_controls");
  });

  it("leaves unresolved interpolation expressions unchanged", () => {
    const resolver = createVariableResolver({
      variables: {
        pmCategory: "animals",
      },
    });
    expect(resolver.resolveInValue("${var.missing}_controls")).toBe("${var.missing}_controls");
  });

  it("preserves existing full-token resolution behavior", () => {
    const resolver = createVariableResolver({
      variables: {
        categories: { value: ["animals", "colours"] },
      },
    });
    expect(resolver.resolveInValue("$var.categories")).toEqual(["animals", "colours"]);
  });

  it("supports derived string variables from sampled variables", () => {
    const resolver = createVariableResolver({
      variables: {
        pmCategory: {
          scope: "participant",
          sampler: { type: "list", values: ["animals", "colours"] },
        },
        controlCategory: "${var.pmCategory}_controls",
      },
    });
    const pm = String(resolver.resolveInValue("$var.pmCategory"));
    const control = String(resolver.resolveInValue("$var.controlCategory"));
    expect(["animals", "colours"]).toContain(pm);
    expect(control).toBe(`${pm}_controls`);
  });

  it("resolves indexed paths into array entries", () => {
    const resolver = createVariableResolver({
      variables: {
        pmOrder: {
          value: [
            { label: "animals", descriptor: "An animal." },
            { label: "colour", descriptor: "A colour." },
          ],
        },
      },
    });
    expect(resolver.resolveInValue("$var.pmOrder.0.label")).toBe("animals");
    expect(resolver.resolveInValue("$var.pmOrder.1.descriptor")).toBe("A colour.");
  });

  it("interpolates indexed array paths inside template strings", () => {
    const resolver = createVariableResolver({
      variables: {
        pmOrder: {
          value: [
            { label: "animals", descriptor: "An animal." },
            { label: "colour", descriptor: "A colour." },
            { label: "fruit_veg", descriptor: "A fruit or vegetable." },
          ],
        },
      },
    });
    expect(resolver.resolveInValue("${var.pmOrder.0.label}|${var.pmOrder.1.label}|${var.pmOrder.2.label}"))
      .toBe("animals|colour|fruit_veg");
  });

  it("resolves nested indirection through between vars into indexed pmOrder descriptors", () => {
    const resolver = createVariableResolver({
      variables: {
        pmOrder: {
          scope: "participant",
          count: 4,
          sampler: {
            type: "list",
            without_replacement: true,
            values: [
              { descriptor: "D1" },
              { descriptor: "D2" },
              { descriptor: "D3" },
              { descriptor: "D4" },
            ],
          },
        },
        between: {
          scope: "participant",
          sampler: {
            type: "list",
            values: [
              {
                cell2Intro: "X:${var.pmOrder.1.descriptor}|${var.pmOrder.2.descriptor}|${var.pmOrder.3.descriptor}",
              },
            ],
          },
        },
      },
    });

    const resolved = String(
      resolver.resolveInValue("$var.blockIntro", {
        blockIndex: 0,
        locals: {
          blockIntro: "$between.cell2Intro",
        },
      }),
    );
    expect(resolved.startsWith("X:")).toBe(true);
    expect(resolved).not.toContain("${var.pmOrder.");
  });

  it("fully resolves embedded templates returned by namespace path tokens", () => {
    const resolver = createVariableResolver({
      variables: {
        pmOrder: {
          value: [{ descriptor: "A colour." }],
        },
        between: {
          value: {
            cellIntro: "For this block:\n${var.pmOrder.0.descriptor}",
          },
        },
      },
    });

    expect(resolver.resolveInValue("$between.cellIntro")).toBe("For this block:\nA colour.");
  });
});

describe("createVariableResolver arithmetic", () => {
  it("supports basic division in templates", () => {
    const resolver = createVariableResolver({
      variables: {
        target_ms: 1000,
      },
    });
    expect(resolver.resolveInValue("${var.target_ms / 1000} seconds")).toBe("1 seconds");
  });

  it("supports multiplication and addition", () => {
    const resolver = createVariableResolver({
      variables: {
        base: 10,
      },
    });
    expect(resolver.resolveInValue("${var.base * 2 + 5}")).toBe("25");
  });

  it("handles spaces correctly", () => {
    const resolver = createVariableResolver({
      variables: {
        a: 10,
        b: 20,
      },
    });
    expect(resolver.resolveInValue("${ var.a  +  var.b }")).toBe("30");
  });

  it("supports nested object paths in arithmetic", () => {
    const resolver = createVariableResolver({
      variables: {
        bricks: {
          completionParams: {
            target_hold_ms: 2500,
          },
        },
      },
    });
    expect(resolver.resolveInValue("${bricks.completionParams.target_hold_ms / 1000}")).toBe("2.5");
  });

  it("supports arithmetic via resolveToken for {key} style placeholders", () => {
    const resolver = createVariableResolver({
      variables: {
        val: 1000,
      },
    });
    // This simulates what resolveTemplatedString does
    const key = "val / 1000";
    const token = `$${key}`;
    expect(resolver.resolveToken(token)).toBe(1);
  });

  it("supports explicit namespaces in arithmetic", () => {
    const resolver = createVariableResolver({
      namespaces: {
        config: { value: 500 }
      }
    });
    expect(resolver.resolveInValue("${config.value * 2}")).toBe("1000");
  });
});
