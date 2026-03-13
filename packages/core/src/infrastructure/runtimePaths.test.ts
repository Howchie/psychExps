/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveRuntimePath } from "./runtimePaths";

afterEach(() => {
  delete (window as unknown as { jatos?: unknown }).jatos;
});

describe("resolveRuntimePath", () => {
  it("preserves root-relative paths outside JATOS", () => {
    expect(resolveRuntimePath("/configs/nback/default.json")).toBe("/configs/nback/default.json");
  });

  it("rewrites root-relative paths inside JATOS", () => {
    (window as unknown as { jatos?: unknown }).jatos = { submitResultData: async () => {} };
    expect(resolveRuntimePath("/configs/nback/default.json")).toBe("configs/nback/default.json");
  });

  it("preserves absolute URLs", () => {
    expect(resolveRuntimePath("https://example.com/a.json")).toBe("https://example.com/a.json");
  });
});

