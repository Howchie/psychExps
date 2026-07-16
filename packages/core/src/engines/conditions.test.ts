import { describe, it, expect } from "vitest";
import { parseQuotaMap } from "./conditions";

describe("parseQuotaMap", () => {
  it("splits trials evenly when no quota is provided", () => {
    expect(parseQuotaMap(null, ["a", "b", "c"], 9)).toEqual({ a: 3, b: 3, c: 3 });
  });

  it("distributes the remainder from the first label onward", () => {
    expect(parseQuotaMap(null, ["a", "b", "c"], 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(parseQuotaMap({}, ["a", "b"], 5)).toEqual({ a: 3, b: 2 });
  });

  it("uses provided quotas that sum to the expected total", () => {
    expect(parseQuotaMap({ a: 6, b: 4 }, ["a", "b"], 10)).toEqual({ a: 6, b: 4 });
  });

  it("defaults missing labels to zero when a quota is provided", () => {
    expect(parseQuotaMap({ a: 10 }, ["a", "b"], 10)).toEqual({ a: 10, b: 0 });
  });

  it("throws when provided quotas do not sum to the expected total", () => {
    expect(() => parseQuotaMap({ a: 3, b: 3 }, ["a", "b"], 10)).toThrow(
      "Config invalid: quota total (6) must equal blockTemplate.trials (10).",
    );
  });

  it("prefixes errors with the task name when given", () => {
    expect(() => parseQuotaMap({ a: 1 }, ["a"], 2, { taskName: "Stroop" })).toThrow(
      "Stroop config invalid",
    );
  });
});
