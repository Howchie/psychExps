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
import { describe, it, expect } from 'vitest';
import { csvCell, recordsToCsv, inferCsvFromPayload } from './data';

describe('csvCell', () => {
  it('should handle null and undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('should handle empty string', () => {
    expect(csvCell('')).toBe('');
  });

  it('should return simple strings as is', () => {
    expect(csvCell('simple')).toBe('simple');
  });

  it('should handle numbers and booleans', () => {
    expect(csvCell(123)).toBe('123');
    expect(csvCell(true)).toBe('true');
  });

  it('should escape strings with commas', () => {
    expect(csvCell('one,two')).toBe('"one,two"');
  });

  it('should escape strings with double quotes', () => {
    expect(csvCell('he said "hello"')).toBe('"he said ""hello"""');
  });

  it('should escape strings with newlines', () => {
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('should handle complex cases with multiple special characters', () => {
    const input = 'complex "case", with commas\nand newlines';
    const expected = '"complex ""case"", with commas\nand newlines"';
    expect(csvCell(input)).toBe(expected);
  });
});

describe('recordsToCsv', () => {
  it('should return empty string for empty array', () => {
    expect(recordsToCsv([])).toBe('');
  });

  it('should convert single record to CSV', () => {
    const records = [{ name: 'John', age: 30 }];
    expect(recordsToCsv(records)).toBe('name,age\nJohn,30');
  });

  it('should convert multiple records and handle escaping', () => {
    const records = [
      { name: 'John', note: 'simple' },
      { name: 'Jane', note: 'has "quotes" and , commas' }
    ];
    const expected = 'name,note\nJohn,simple\nJane,"has ""quotes"" and , commas"';
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

describe('inferCsvFromPayload', () => {
  it('should infer from direct array', () => {
    const payload = [{ a: 1, b: 2 }];
    expect(inferCsvFromPayload(payload)).toBe('a,b\n1,2');
  });

  it('should infer from "records" key', () => {
    const payload = { records: [{ a: 1 }] };
    expect(inferCsvFromPayload(payload)).toBe('a\n1');
  });

  it('should infer from "trials" key', () => {
    const payload = { trials: [{ a: 1 }] };
    expect(inferCsvFromPayload(payload)).toBe('a\n1');
  });

  it('should handle single object payload', () => {
    const payload = { a: 1, b: 2 };
    expect(inferCsvFromPayload(payload)).toBe('a,b\n1,2');
  });

  it('should return null for non-record-like payload', () => {
    expect(inferCsvFromPayload(123)).toBeNull();
    expect(inferCsvFromPayload('string')).toBeNull();
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
