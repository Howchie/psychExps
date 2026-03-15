import { describe, it, expect } from "vitest";
import { normalizeKey } from "./keys";

describe("normalizeKey", () => {
  it("should convert keys to lowercase", () => {
    expect(normalizeKey("A")).toBe("a");
    expect(normalizeKey("Enter")).toBe("enter");
    expect(normalizeKey("ESCAPE")).toBe("escape");
  });

  it("should normalize space variations to 'space'", () => {
    expect(normalizeKey(" ")).toBe("space");
    expect(normalizeKey("spacebar")).toBe("space");
    expect(normalizeKey("space")).toBe("space");
    expect(normalizeKey("Space")).toBe("space");
    expect(normalizeKey("SPACEBAR")).toBe("space");
  });

  it("should handle empty or missing values", () => {
    expect(normalizeKey("")).toBe("");
    expect(normalizeKey(undefined as any)).toBe("");
    expect(normalizeKey(null as any)).toBe("");
  });

  it("should handle non-string values gracefully", () => {
    expect(normalizeKey(123 as any)).toBe("123");
    expect(normalizeKey(false as any)).toBe(""); // false || "" evaluates to ""
    expect(normalizeKey(0 as any)).toBe(""); // 0 || "" evaluates to ""
  });
});
