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
  });
});
