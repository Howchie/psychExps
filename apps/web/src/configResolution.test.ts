import { describe, expect, it } from "vitest";
import { buildConfigReferenceCandidates, toBundledConfigKey, toConfigFetchPath } from "./configResolution";

describe("configResolution", () => {
  it("resolves bare config names to variant path and task-scoped path first", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "annikaHons",
      taskId: "nback",
      variants: [
        { id: "default", configPath: "nback/default" },
        { id: "annikaHons", configPath: "nback/annikaHons" },
      ],
    });
    expect(candidates).toEqual(["nback/annikaHons", "annikaHons"]);
  });

  it("resolves unknown bare names to task-scoped then raw fallback", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "pilotA",
      taskId: "stroop",
      variants: [{ id: "default", configPath: "stroop/default" }],
    });
    expect(candidates).toEqual(["stroop/pilotA", "pilotA"]);
  });

  it("keeps path-like references as-is", () => {
    const candidates = buildConfigReferenceCandidates({
      requestedConfig: "bricks/spotlight",
      taskId: "bricks",
      variants: [],
    });
    expect(candidates).toEqual(["bricks/spotlight"]);
  });

  it("normalizes bundled config keys from .json and configs prefixes", () => {
    expect(toBundledConfigKey("nback/default")).toBe("nback/default");
    expect(toBundledConfigKey("nback/default.json")).toBe("nback/default");
    expect(toBundledConfigKey("/configs/nback/default.json")).toBe("nback/default");
    expect(toBundledConfigKey("configs/nback/default")).toBe("nback/default");
  });

  it("builds fetch paths for logical config names", () => {
    expect(toConfigFetchPath("nback/default")).toBe("/configs/nback/default.json");
    expect(toConfigFetchPath("/custom/file.json")).toBe("/custom/file.json");
  });
});
