/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { rdkAdapter } from './index';

describe('rdkAdapter', () => {
  it('exposes manifest and lifecycle hooks', () => {
    expect(rdkAdapter.manifest.taskId).toBe('rdk');
    expect(typeof rdkAdapter.initialize).toBe('function');
    expect(typeof rdkAdapter.execute).toBe('function');
    expect(typeof rdkAdapter.terminate).toBe('function');
  });
});
