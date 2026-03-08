import { describe, expect, it } from "vitest";
import { createCoreRng } from "./random";

describe("createCoreRng", () => {
  it("is deterministic for the same seed and call sequence", () => {
    const a = createCoreRng(12345);
    const b = createCoreRng("12345");

    expect(a.next()).toBe(b.next());
    expect(a.nextFloat()).toBe(b.nextFloat());
    expect(a.nextRange(10, 20)).toBe(b.nextRange(10, 20));
    expect(a.nextNormal(0, 1)).toBe(b.nextNormal(0, 1));
    expect(a.next()).toBe(b.next());
  });

  it("throws on invalid range", () => {
    const rng = createCoreRng(1);
    expect(() => rng.nextRange(5, 5)).toThrow("RNG.nextRange expects max > min");
    expect(() => rng.nextRange(6, 5)).toThrow("RNG.nextRange expects max > min");
  });

  it("throws on invalid sigma", () => {
    const rng = createCoreRng(1);
    expect(() => rng.nextNormal(0, 0)).toThrow("RNG.nextNormal expects sigma > 0");
    expect(() => rng.nextNormal(0, -1)).toThrow("RNG.nextNormal expects sigma > 0");
  });

  it("produces bounded and finite values", () => {
    const rng = createCoreRng(77);
    for (let i = 0; i < 200; i += 1) {
      const u = rng.nextFloat();
      const r = rng.nextRange(-5, 5);
      const n = rng.nextNormal(0, 1);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      expect(r).toBeGreaterThanOrEqual(-5);
      expect(r).toBeLessThan(5);
      expect(Number.isFinite(n)).toBe(true);
    }
  });

  it("supports unseeded mode", () => {
    const rng = createCoreRng("auto");
    const u = rng.nextFloat();
    const r = rng.nextRange(0, 1);
    const n = rng.nextNormal();
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    expect(Number.isFinite(n)).toBe(true);
  });
});

