/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveAssetPath } from "./stimulus";

afterEach(() => {
  delete (window as unknown as { jatos?: unknown }).jatos;
});

describe("resolveAssetPath", () => {
  it("keeps leading slash paths locally when basePath is root-relative", () => {
    const resolved = resolveAssetPath({
      basePath: "/assets/pm-words",
      template: "practice.csv",
    });
    expect(resolved).toBe("/assets/pm-words/practice.csv");
  });

  it("rewrites root-relative base paths to component-relative paths in JATOS", () => {
    (window as unknown as { jatos?: unknown }).jatos = { submitResultData: async () => {} };
    const resolved = resolveAssetPath({
      basePath: "/assets/pm-words",
      template: "practice.csv",
    });
    expect(resolved).toBe("assets/pm-words/practice.csv");
  });

  it("treats leading-slash template paths as absolute templates that bypass basePath", () => {
    const localResolved = resolveAssetPath({
      basePath: "/assets/pm-words",
      template: "/practice.csv",
    });
    expect(localResolved).toBe("/practice.csv");

    (window as unknown as { jatos?: unknown }).jatos = { submitResultData: async () => {} };
    const jatosResolved = resolveAssetPath({
      basePath: "/assets/pm-words",
      template: "/practice.csv",
    });
    expect(jatosResolved).toBe("practice.csv");
  });

  it("supports runtime base tokens in basePath templates", () => {
    const localResolved = resolveAssetPath({
      basePath: "{runtime.assetsBase}/pm-words",
      template: "practice.csv",
    });
    expect(localResolved).toBe("/assets/pm-words/practice.csv");

    (window as unknown as { jatos?: unknown }).jatos = { submitResultData: async () => {} };
    const jatosResolved = resolveAssetPath({
      basePath: "{runtime.assetsBase}/pm-words",
      template: "practice.csv",
    });
    expect(jatosResolved).toBe("assets/pm-words/practice.csv");
  });
});
