import { describe, expect, it } from "vitest";
import { resolveScopedModuleConfig } from "./moduleConfig";

describe("resolveScopedModuleConfig", () => {
  it("prefers local modules over task.modules and returns null when missing", () => {
    expect(
      resolveScopedModuleConfig(
        {
          task: { modules: { drt: { enabled: true, scope: "block" } } },
          modules: { drt: { enabled: true, scope: "trial" } },
        },
        "drt",
      ),
    ).toEqual({ enabled: true, scope: "trial" });

    expect(
      resolveScopedModuleConfig(
        { task: { modules: { drt: { enabled: true, scope: "block" } } } },
        "drt",
      ),
    ).toEqual({ enabled: true, scope: "block" });

    expect(resolveScopedModuleConfig({ task: {} }, "drt")).toBeNull();
  });
});
