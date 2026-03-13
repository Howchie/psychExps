import { describe, it, expect } from 'vitest';
import { asStringArray, asPositiveNumberArray, coerceInstructionInsertions } from './coerce';

describe('coerce utilities', () => {
  describe('asStringArray', () => {
    it('should return a string array from valid input', () => {
      expect(asStringArray(['a', 'b'], ['fallback'])).toEqual(['a', 'b']);
    });

    it('should filter out non-string values', () => {
      expect(asStringArray(['a', 1, null, 'b'], ['fallback'])).toEqual(['a', 'b']);
    });

    it('should return fallback if input is not an array', () => {
      expect(asStringArray('not an array', ['fallback'])).toEqual(['fallback']);
    });

    it('should return fallback if input array is empty after filtering', () => {
      expect(asStringArray([1, 2, 3], ['fallback'])).toEqual(['fallback']);
    });
  });

  describe('asPositiveNumberArray', () => {
    it('should return a positive number array from valid input', () => {
      expect(asPositiveNumberArray([1, 2, 3], [10])).toEqual([1, 2, 3]);
    });

    it('should filter out non-positive or non-finite values', () => {
      expect(asPositiveNumberArray([1, -1, 0, Infinity, '2', 3], [10])).toEqual([1, 2, 3]);
    });

    it('should floor values', () => {
      expect(asPositiveNumberArray([1.5, 2.9], [10])).toEqual([1, 2]);
    });

    it('should return fallback if input is not an array', () => {
      expect(asPositiveNumberArray(null, [10])).toEqual([10]);
    });
  });

  describe('coerceInstructionInsertions', () => {
    it('should parse valid insertion entries', () => {
      expect(
        coerceInstructionInsertions([
          {
            id: 'x',
            at: 'block_start_after_intro',
            pages: ['A', 'B'],
            when: { blockIndex: [1], blockType: ['MAIN'], isPractice: false },
          },
        ]),
      ).toEqual([
        {
          id: 'x',
          at: 'block_start_after_intro',
          pages: [{ text: 'A' }, { text: 'B' }],
          when: { blockIndex: [1], blockType: ['main'], isPractice: false },
        },
      ]);
    });

    it('should ignore invalid entries and empty pages', () => {
      expect(
        coerceInstructionInsertions([
          { at: 'not_a_point', pages: ['x'] },
          { at: 'task_intro_before', pages: '' },
          { at: 'task_intro_after', pages: ['ok'] },
        ]),
      ).toEqual([
        { at: 'task_intro_after', pages: [{ text: 'ok' }] },
      ]);
    });
  });
});
