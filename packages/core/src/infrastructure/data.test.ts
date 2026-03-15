import { describe, it, expect } from "vitest";
import { csvCell, recordsToCsv, inferCsvFromPayload } from "./data";

describe("csvCell", () => {
  it("should handle normal strings", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell("world 123")).toBe("world 123");
  });

  it("should handle numbers", () => {
    expect(csvCell(123)).toBe("123");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(-42.5)).toBe("-42.5");
  });

  it("should handle null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("should escape strings with commas", () => {
    expect(csvCell("hello, world")).toBe('"hello, world"');
  });

  it("should escape strings with double quotes", () => {
    expect(csvCell('he said "hello"')).toBe('"he said ""hello"""');
  });

  it("should escape strings with newlines", () => {
    expect(csvCell("hello\nworld")).toBe('"hello\nworld"');
  });

  it("should handle booleans", () => {
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });
});

describe("recordsToCsv", () => {
  it("should return empty string for empty array", () => {
    expect(recordsToCsv([])).toBe("");
  });

  it("should format simple records correctly", () => {
    const records = [
      { id: 1, name: "Alice", active: true },
      { id: 2, name: "Bob", active: false },
    ];
    const expected = [
      "id,name,active",
      "1,Alice,true",
      "2,Bob,false",
    ].join("\n");
    expect(recordsToCsv(records)).toBe(expected);
  });

  it("should handle special characters in records", () => {
    const records = [
      { id: 1, name: "Alice, Smith", note: 'said "hi"' },
      { id: 2, name: "Bob\nJones", note: null },
    ];
    const expected = [
      "id,name,note",
      '1,"Alice, Smith","said ""hi"""',
      '2,"Bob\nJones",',
    ].join("\n");
    expect(recordsToCsv(records)).toBe(expected);
  });
});

describe("inferCsvFromPayload", () => {
  it("should infer from a direct array of records", () => {
    const payload = [
      { id: 1, value: "a" },
      { id: 2, value: "b" },
    ];
    const expected = "id,value\n1,a\n2,b";
    expect(inferCsvFromPayload(payload)).toBe(expected);
  });

  it("should infer from an object containing an array under a preferred key", () => {
    const payload = {
      meta: "info",
      records: [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ],
    };
    const expected = "id,value\n1,a\n2,b";
    expect(inferCsvFromPayload(payload)).toBe(expected);
  });

  it("should try different preferred keys (trials, rows, results, data)", () => {
    const keys = ["trials", "rows", "results", "data"];
    for (const key of keys) {
      const payload = {
        [key]: [
          { id: 1, value: "a" },
          { id: 2, value: "b" },
        ],
      };
      const expected = "id,value\n1,a\n2,b";
      expect(inferCsvFromPayload(payload)).toBe(expected);
    }
  });

  it("should infer from an object containing an array under a non-preferred key", () => {
    const payload = {
      customItems: [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ],
    };
    const expected = "id,value\n1,a\n2,b";
    expect(inferCsvFromPayload(payload)).toBe(expected);
  });

  it("should fallback to stringifying a single flat object", () => {
    const payload = { id: 1, name: "Alice", active: true };
    const expected = "id,name,active\n1,Alice,true";
    expect(inferCsvFromPayload(payload)).toBe(expected);
  });

  it("should return null for invalid payloads", () => {
    expect(inferCsvFromPayload(null)).toBeNull();
    expect(inferCsvFromPayload("string")).toBeNull();
    expect(inferCsvFromPayload(123)).toBeNull();
    expect(inferCsvFromPayload(true)).toBeNull();
    // Array of non-records
    expect(inferCsvFromPayload([1, 2, 3])).toBeNull();
  });
});
