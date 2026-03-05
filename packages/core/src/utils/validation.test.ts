import { describe, it, expect } from 'vitest';
import { validateTaskConfigIsolation, validateCoreSelectionDefaults } from './validation';

describe('validation utilities', () => {
  describe('validateTaskConfigIsolation', () => {
    it('should pass for valid config', () => {
      expect(() => validateTaskConfigIsolation('sft', { task: { foo: 'bar' } })).not.toThrow();
    });

    it('should throw for forbidden root key', () => {
      expect(() => validateTaskConfigIsolation('sft', { pm: {} })).toThrow('Config isolation violation');
    });

    it('should throw for forbidden task namespace key', () => {
      expect(() => validateTaskConfigIsolation('sft', { task: { pm: {} } })).toThrow('Config isolation violation');
    });
  });

  describe('validateCoreSelectionDefaults', () => {
    it('should pass for valid selection', () => {
      expect(() => validateCoreSelectionDefaults({ selection: { taskId: 'sft', variantId: 'default' } })).not.toThrow();
    });

    it('should throw if selection is missing', () => {
      expect(() => validateCoreSelectionDefaults({})).toThrow('Core config must include selection defaults');
    });

    it('should throw if taskId is empty', () => {
      expect(() => validateCoreSelectionDefaults({ selection: { taskId: '', variantId: 'default' } })).toThrow('core.selection.taskId must be non-empty');
    });
  });
});
