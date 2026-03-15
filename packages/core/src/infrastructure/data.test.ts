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
  });
});
