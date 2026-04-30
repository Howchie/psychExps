import { describe, it, expect } from 'vitest';
import { buildTaskMap } from './registry';
import type { TaskAdapter } from './taskAdapter';

describe('task registry', () => {
  const mockAdapter: TaskAdapter = {
    manifest: {
      taskId: 'test-task',
      label: 'Test Task',
    },
    initialize: async () => {},
    execute: async () => ({}),
    terminate: async () => {},
  };

  describe('buildTaskMap', () => {
    it('should map task IDs to adapters', () => {
      const map = buildTaskMap([mockAdapter]);
      expect(map.get('test-task')).toBe(mockAdapter);
    });
  });
});
