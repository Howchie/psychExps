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
});
