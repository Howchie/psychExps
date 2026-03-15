import { describe, it, expect } from "vitest";
import { csvCell, recordsToCsv, inferCsvFromPayload } from "./data";

describe("csvCell", () => {
  it("wraps strings containing commas in quotes", () => {
    expect(csvCell("hello, world")).toBe('"hello, world"');
  });

  it("wraps strings containing newlines in quotes", () => {
    expect(csvCell("hello\nworld")).toBe('"hello\nworld"');
  });

  it("escapes quotes in strings by doubling them up and wraps the string in quotes", () => {
    expect(csvCell('he said "hello"')).toBe('"he said ""hello"""');
  });

  it("does not wrap standard strings in quotes", () => {
    expect(csvCell("hello world")).toBe("hello world");
  });

  it("handles numbers appropriately", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(3.14)).toBe("3.14");
  });

  it("handles null and undefined by outputting an empty string", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("recordsToCsv", () => {
  it("returns an empty string if provided an empty array", () => {
    expect(recordsToCsv([])).toBe("");
  });

  it("correctly converts uniform records into a CSV string", () => {
    const records = [
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: 25 },
    ];
    const result = recordsToCsv(records);
    expect(result).toBe("id,name,age\n1,Alice,30\n2,Bob,25");
  });

  it("handles arbitrary, non-uniform columns across different records correctly", () => {
    const records = [
      { id: 1 },
      { id: 2, arbitrary: "foo" },
      { id: 3, arbitrary: "bar", other: "baz" }
    ];
    const result = recordsToCsv(records);
    expect(result).toBe("id,arbitrary,other\n1,,\n2,foo,\n3,bar,baz");
  });

  it("outputs a cell containing a comma correctly by quoting it", () => {
    const records = [
      { city: "New York, NY", population: 8000000 }
    ];
    const result = recordsToCsv(records);
    expect(result).toBe('city,population\n"New York, NY",8000000');
  });
});

describe("inferCsvFromPayload", () => {
  it("infers CSV directly from an array of records", () => {
    const payload = [
      { a: 1, b: 2 },
      { a: 3, b: 4 }
    ];
    expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2\n3,4");
  });

  it("infers CSV from a payload object with a 'records' key", () => {
    const payload = {
      records: [
        { a: 1, b: 2 },
        { a: 3, b: 4 }
      ]
    };
    expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2\n3,4");
  });

  it("infers CSV from an object with an unknown key but that contains an array of records", () => {
    const payload = {
      something: [
        { a: 1, b: 2 },
        { a: 3, b: 4 }
      ]
    };
    expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2\n3,4");
  });

  it("infers CSV from a simple non-array payload by wrapping it", () => {
    const payload = { a: 1, b: 2 };
    expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2");
  });

  it("returns null if payload is not an object", () => {
    expect(inferCsvFromPayload("string payload")).toBeNull();
    expect(inferCsvFromPayload(42)).toBeNull();
  });
});
