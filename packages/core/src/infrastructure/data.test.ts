// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { csvCell, recordsToCsv, inferCsvFromPayload, downloadJson, downloadCsv } from './data';
import type { SelectionContext } from '../api/types';

describe('data', () => {
  describe('csvCell', () => {
    it('handles null and undefined', () => {
      expect(csvCell(null)).toBe("");
      expect(csvCell(undefined)).toBe("");
    });

    it('returns string representations of primitive values', () => {
      expect(csvCell(42)).toBe("42");
      expect(csvCell(true)).toBe("true");
      expect(csvCell(false)).toBe("false");
      expect(csvCell("test")).toBe("test");
    });

    it('quotes strings with commas', () => {
      expect(csvCell("hello, world")).toBe('"hello, world"');
    });

    it('quotes strings with newlines', () => {
      expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    });

    it('quotes strings with double quotes and escapes them', () => {
      expect(csvCell('he said "hello"')).toBe('"he said ""hello"""');
    });

    it('quotes strings with multiple special characters', () => {
      expect(csvCell('hello, "world"\n')).toBe('"hello, ""world""\n"');
    });
  });

  describe('recordsToCsv', () => {
    it('returns empty string for empty array', () => {
      expect(recordsToCsv([])).toBe("");
    });

    it('formats a simple array of objects', () => {
      const records = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 }
      ];
      expect(recordsToCsv(records)).toBe("name,age\nAlice,30\nBob,25");
    });

    it('handles special characters in data using csvCell', () => {
      const records = [
        { name: 'Alice, Smith', note: 'Line1\nLine2' },
        { name: 'Bob "The Builder"', note: 'Done' }
      ];
      expect(recordsToCsv(records)).toBe('name,note\n"Alice, Smith","Line1\nLine2"\n"Bob ""The Builder""",Done');
    });
  });

  describe('inferCsvFromPayload', () => {
    it('infers from a direct array of records', () => {
      const payload = [
        { a: 1, b: 2 },
        { a: 3, b: 4 }
      ];
      expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2\n3,4");
    });

    it('infers from a single record payload', () => {
      const payload = { a: 1, b: 2 };
      expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2");
    });

    it('infers from an array inside a preferred key', () => {
      const payload = {
        metadata: "info",
        records: [{ x: 10 }, { x: 20 }]
      };
      expect(inferCsvFromPayload(payload)).toBe("x\n10\n20");
    });

    it('infers from an array inside any key if preferred keys are not present', () => {
      const payload = {
        someRandomKey: [{ y: 5 }, { y: 6 }]
      };
      expect(inferCsvFromPayload(payload)).toBe("y\n5\n6");
    });

    it('returns null if payload is not a record or array of records', () => {
      expect(inferCsvFromPayload("string payload")).toBeNull();
      expect(inferCsvFromPayload(42)).toBeNull();
      expect(inferCsvFromPayload(null)).toBeNull();
    });

    it('returns null if payload is an array of non-records', () => {
      expect(inferCsvFromPayload([1, 2, 3])).toBeNull();
      expect(inferCsvFromPayload(["a", "b"])).toBeNull();
    });
  });

  describe('downloads (DOM mocked)', () => {
    let originalCreateObjectURL: any;
    let originalRevokeObjectURL: any;

    beforeEach(() => {
      // Mocking URL methods which might not exist in the test environment
      originalCreateObjectURL = global.URL.createObjectURL;
      originalRevokeObjectURL = global.URL.revokeObjectURL;

      global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
      global.URL.revokeObjectURL = vi.fn();

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-10-15T12:00:00Z'));
    });

    afterEach(() => {
      global.URL.createObjectURL = originalCreateObjectURL;
      global.URL.revokeObjectURL = originalRevokeObjectURL;
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('downloadJson works correctly', () => {
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      const selection = {
        taskId: 'task1',
        variantId: 'var1',
        participant: { participantId: 'part1', role: 'user' },
        isDemo: false
      } as unknown as SelectionContext;

      downloadJson({ hello: "world" }, "prefix", selection);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('prefix_task1_var1_part1_2023-10-15T12-00-00-000Z.json');
      expect(mockAnchor.href).toBe('blob:test-url');
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('downloadCsv works correctly', () => {
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

      const selection = {
        taskId: 'task2',
        variantId: 'var2',
        participant: { participantId: 'part2', role: 'user' },
        isDemo: false
      } as unknown as SelectionContext;

      downloadCsv("a,b\n1,2", "prefix2", selection);

      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('prefix2_task2_var2_part2_data_2023-10-15T12-00-00-000Z.csv');
      expect(mockAnchor.href).toBe('blob:test-url');
      expect(appendChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockAnchor);
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });
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
