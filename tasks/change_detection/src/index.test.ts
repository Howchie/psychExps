/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { changeDetectionAdapter } from './index';

describe('changeDetectionAdapter', () => {
  it('exposes manifest and lifecycle hooks', () => {
    expect(changeDetectionAdapter.manifest.taskId).toBe('change_detection');
    expect(typeof changeDetectionAdapter.initialize).toBe('function');
    expect(typeof changeDetectionAdapter.execute).toBe('function');
    expect(typeof changeDetectionAdapter.terminate).toBe('function');
  });
});
