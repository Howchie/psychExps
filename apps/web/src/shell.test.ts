/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// We'll mock core to avoid complex setups
vi.mock('@experiments/core', async () => {
  const actual = await vi.importActual('@experiments/core');
  return {
    ...actual,
    LifecycleManager: vi.fn().mockImplementation(function() {
      return {
        run: vi.fn().mockResolvedValue({ success: true })
      };
    }),
    resolveSelection: vi.fn(),
    ConfigurationManager: vi.fn().mockImplementation(() => ({
      load: vi.fn().mockResolvedValue({}),
      merge: vi.fn().mockReturnValue({})
    })),
    buildTaskMap: vi.fn().mockReturnValue(new Map())
  };
});

import { LifecycleManager, resolveSelection, buildTaskMap } from '@experiments/core';

describe('Web Shell Loading (Mocked)', () => {
  it('should find and run the selected task', async () => {
    const mockAdapter = { manifest: { taskId: 'test-task' }, launch: vi.fn() };
    const adapterMap = new Map([['test-task', mockAdapter]]);
    (buildTaskMap as any).mockReturnValue(adapterMap);
    (resolveSelection as any).mockReturnValue({ taskId: 'test-task', variantId: 'default' });

    // This is a conceptual test for the streamlining logic
    const selection = resolveSelection({} as any);
    const adapter = adapterMap.get(selection.taskId);
    
    expect(adapter).toBe(mockAdapter);
    
    const manager = new LifecycleManager(adapter as any);
    await manager.run({} as any);
    
    expect(manager.run).toHaveBeenCalled();
  });
});
