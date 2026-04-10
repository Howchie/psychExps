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
      expect(csvCell(0)).toBe("0");
      expect(csvCell(-42.5)).toBe("-42.5");
    });

    it('quotes strings with commas', () => {
      expect(csvCell("hello, world")).toBe('"hello, world"');
    });

    it('quotes strings with newlines', () => {
      expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    });

    it('quotes strings with double quotes and escapes them', () => {
      expect(csvCell('he said "hello"')).toBe('"he said ""hello"""');
      expect(csvCell('hello "world"')).toBe('"hello ""world"""');
      expect(csvCell('a"b')).toBe('"a""b"');
    });

    it('quotes strings with multiple special characters', () => {
      expect(csvCell('hello, "world"\n')).toBe('"hello, ""world""\n"');
      const input = 'complex "case", with commas\nand newlines';
      const expected = '"complex ""case"", with commas\nand newlines"';
      expect(csvCell(input)).toBe(expected);
    });

    it("handles strings without special characters", () => {
      expect(csvCell("hello world")).toBe("hello world");
    });

    it("serializes object and array values as JSON", () => {
      expect(csvCell({ a: 1, b: "x" })).toBe('"{""a"":1,""b"":""x""}"');
      expect(csvCell([1, "two", true])).toBe('"[1,""two"",true]"');
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

    it('handles arbitrary, non-uniform columns across different records correctly', () => {
      const records = [
        { id: 1 },
        { id: 2, arbitrary: "foo" },
        { id: 3, arbitrary: "bar", other: "baz" }
      ];
      const result = recordsToCsv(records);
      expect(result).toBe("id,arbitrary,other\n1,,\n2,foo,\n3,bar,baz");
    });

    it('handles special characters in data using csvCell', () => {
      const records = [
        { name: 'Alice, Smith', note: 'Line1\nLine2' },
        { name: 'Bob "The Builder"', note: 'Done' }
      ];
      expect(recordsToCsv(records)).toBe('name,note\n"Alice, Smith","Line1\nLine2"\n"Bob ""The Builder""",Done');
    });

    it("outputs a cell containing a comma correctly by quoting it", () => {
      const records = [
        { city: "New York, NY", population: 8000000 }
      ];
      const result = recordsToCsv(records);
      expect(result).toBe('city,population\n"New York, NY",8000000');
    });
  });

  describe('inferCsvFromPayload', () => {
    it('infers from a direct array of records', () => {
      const payload = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ];
      expect(inferCsvFromPayload(payload)).toBe("id,value\n1,a\n2,b");
    });

    it('infers from a single record payload', () => {
      const payload = { a: 1, b: 2 };
      expect(inferCsvFromPayload(payload)).toBe("a,b\n1,2");
    });

    it('infers from an array inside a preferred key', () => {
      const keys = ["records", "trials", "rows", "results", "data"];
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

    it('infers from an array inside an arbitrary key if preferred keys are not present', () => {
      const payload = {
        customItems: [
          { id: 1, value: "a" },
          { id: 2, value: "b" },
        ],
      };
      const expected = "id,value\n1,a\n2,b";
      expect(inferCsvFromPayload(payload)).toBe(expected);
    });

    it('returns null if payload is not a record or array of records', () => {
      expect(inferCsvFromPayload("string payload")).toBeNull();
      expect(inferCsvFromPayload(42)).toBeNull();
      expect(inferCsvFromPayload(null)).toBeNull();
      expect(inferCsvFromPayload(true)).toBeNull();
    });

    it('returns null if payload is an array of non-records', () => {
      expect(inferCsvFromPayload([1, 2, 3])).toBeNull();
      expect(inferCsvFromPayload(["a", "b"])).toBeNull();
    });

    it("fallback to stringifying a single flat object", () => {
      const payload = { id: 1, name: "Alice", active: true };
      const expected = "id,name,active\n1,Alice,true";
      expect(inferCsvFromPayload(payload)).toBe(expected);
    });
  });

  describe('downloads (DOM mocked)', () => {
    let originalCreateObjectURL: any;
    let originalRevokeObjectURL: any;

    beforeEach(() => {
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
  });
});
