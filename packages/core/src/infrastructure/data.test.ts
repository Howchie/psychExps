import { describe, expect, it } from "vitest";
import { csvCell, inferCsvFromPayload, recordsToCsv } from "./data";

describe("csvCell", () => {
  it("handles basic types", () => {
    expect(csvCell(123)).toBe("123");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(false)).toBe("false");
  });

  it("handles nullish values", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("handles strings without special characters", () => {
    expect(csvCell("hello world")).toBe("hello world");
  });

  it("quotes strings containing commas", () => {
    expect(csvCell("hello, world")).toBe('"hello, world"');
  });

  it("quotes strings containing newlines", () => {
    expect(csvCell("hello\nworld")).toBe('"hello\nworld"');
  });

  it("quotes strings containing double quotes and escapes internal quotes", () => {
    expect(csvCell('hello "world"')).toBe('"hello ""world"""');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

describe("recordsToCsv", () => {
  it("returns an empty string for empty arrays", () => {
    expect(recordsToCsv([])).toBe("");
  });

  it("generates correct header row from object keys", () => {
    const data = [{ a: 1, b: 2, c: 3 }];
    const csv = recordsToCsv(data);
    expect(csv.split("\n")[0]).toBe("a,b,c");
  });

  it("maps values to CSV cells correctly across rows and columns", () => {
    const data = [
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: null },
      { id: 3, name: "Charlie, Jr.", age: 25 },
    ];
    const expected = [
      "id,name,age",
      "1,Alice,30",
      "2,Bob,",
      '3,"Charlie, Jr.",25'
    ].join("\n");
    expect(recordsToCsv(data)).toBe(expected);
  });
});

describe("inferCsvFromPayload", () => {
  it("extracts CSV directly from an array of records", () => {
    const payload = [{ a: 1 }, { a: 2 }];
    expect(inferCsvFromPayload(payload)).toBe("a\n1\n2");
  });

  it("extracts CSV when payload is an object containing arrays under preferred keys", () => {
    const payload = {
      meta: "info",
      records: [{ x: 10 }, { x: 20 }],
    };
    expect(inferCsvFromPayload(payload)).toBe("x\n10\n20");
  });

  it("extracts CSV when payload contains an array under an arbitrary key", () => {
    const payload = {
      metadata: { date: "today" },
      items: [{ y: 5 }, { y: 15 }],
    };
    expect(inferCsvFromPayload(payload)).toBe("y\n5\n15");
  });

  it("falls back to treating the payload object itself as a single row", () => {
    const payload = { a: 1, b: 2 };
    expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2");
  });

  it("returns null for invalid payloads", () => {
    expect(inferCsvFromPayload(null)).toBeNull();
    expect(inferCsvFromPayload(123)).toBeNull();
    expect(inferCsvFromPayload("string")).toBeNull();
    expect(inferCsvFromPayload([1, 2, 3])).toBeNull();
  });
});
