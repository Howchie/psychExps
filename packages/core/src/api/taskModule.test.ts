import { describe, it, expect, vi } from 'vitest';
import { TaskModuleRunner, type TaskModule, type TaskModuleHandle, type TaskModuleAddress, type TaskModuleContext } from './taskModule';

describe('TaskModuleRunner', () => {
  const mockAddress: TaskModuleAddress = { scope: 'block', blockIndex: 0, trialIndex: null };
  const mockContext: TaskModuleContext = {};

  const createMockModule = (id: string, shouldHandleKey: boolean): TaskModule => ({
    id,
    start: () => ({
      stop: () => ({}),
      handleKey: vi.fn().mockReturnValue(shouldHandleKey),
    } as TaskModuleHandle),
  });

  it('should arbitrate keys by priority (reverse start order, first handler stops propagation)', () => {
    const runner = new TaskModuleRunner();
    
    // Create handles to track calls
    const handle1 = { stop: () => ({}), handleKey: vi.fn().mockReturnValue(true) };
    const handle2 = { stop: () => ({}), handleKey: vi.fn().mockReturnValue(true) };

    const module1: TaskModule = { id: 'm1', start: () => handle1 as any };
    const module2: TaskModule = { id: 'm2', start: () => handle2 as any };

    runner.start({ module: module1, address: mockAddress, config: {}, context: mockContext });
    runner.start({ module: module2, address: mockAddress, config: {}, context: mockContext });

    const handled = runner.handleKey('space', 1000);
    
    expect(handled).toBe(true);
    // module2 was started last, so it should be checked first
    expect(handle2.handleKey).toHaveBeenCalled();
    // Since module2 handled it, module1 should NOT be called
    expect(handle1.handleKey).not.toHaveBeenCalled();
  });

  it('should emit onKeyHandled event when a module handles a key', () => {
    const onEvent = vi.fn();
    const runner = new TaskModuleRunner();
    runner.setOptions({ onEvent });

    const module1 = createMockModule('m1', true);
    runner.start({ module: module1, address: mockAddress, config: {}, context: mockContext });

    runner.handleKey('space', 1000);

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'module_key_handled',
      moduleId: 'm1',
      key: 'space',
    }));
  });
});
