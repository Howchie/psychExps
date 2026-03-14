/**
 * @vitest-environment jsdom
 */
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

  it('should start only modules whose configured scope matches startScopedModules scope', () => {
    const blockStart = vi.fn().mockReturnValue({ stop: () => ({}), getData: () => ({}) } as TaskModuleHandle);
    const trialStart = vi.fn().mockReturnValue({ stop: () => ({}), getData: () => ({}) } as TaskModuleHandle);
    const blockModule: TaskModule = { id: 'blockMod', start: blockStart };
    const trialModule: TaskModule = { id: 'trialMod', start: trialStart };
    const runner = new TaskModuleRunner([blockModule, trialModule]);

    runner.startScopedModules({
      scope: 'block',
      blockIndex: 2,
      trialIndex: null,
      moduleConfigs: {
        blockMod: { enabled: true, scope: 'block' },
        trialMod: { enabled: true, scope: 'trial' },
      },
      context: {},
    });

    expect(blockStart).toHaveBeenCalledTimes(1);
    expect(trialStart).not.toHaveBeenCalled();
  });

  it('should stop only matching scoped modules when stopScopedModules is called', () => {
    const stopBlock = vi.fn().mockReturnValue({ ended: 'block' });
    const stopTrial = vi.fn().mockReturnValue({ ended: 'trial' });
    const blockModule: TaskModule = {
      id: 'mblock',
      start: () => ({ stop: stopBlock, getData: () => ({ active: 'block' }) } as TaskModuleHandle),
    };
    const trialModule: TaskModule = {
      id: 'mtrial',
      start: () => ({ stop: stopTrial, getData: () => ({ active: 'trial' }) } as TaskModuleHandle),
    };
    const runner = new TaskModuleRunner();
    const commonConfig = { enabled: true, scope: 'block' };
    runner.start({ module: blockModule, address: { scope: 'block', blockIndex: 0, trialIndex: null }, config: commonConfig, context: {} });
    runner.start({ module: trialModule, address: { scope: 'trial', blockIndex: 0, trialIndex: 0 }, config: { enabled: true, scope: 'trial' }, context: {} });

    const stopped = runner.stopScopedModules({ scope: 'block', blockIndex: 0, trialIndex: null });
    const activeAfter = runner.getActiveData();

    expect(stopped).toHaveLength(1);
    expect(stopped[0].moduleId).toBe('mblock');
    expect(stopBlock).toHaveBeenCalledTimes(1);
    expect(stopTrial).not.toHaveBeenCalled();
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].moduleId).toBe('mtrial');
  });

  it('stopAll should clear all active modules and call each stop exactly once', () => {
    const stopA = vi.fn().mockReturnValue({ a: true });
    const stopB = vi.fn().mockReturnValue({ b: true });
    const modA: TaskModule = {
      id: 'A',
      start: () => ({ stop: stopA, getData: () => ({ active: 'A' }) } as TaskModuleHandle),
    };
    const modB: TaskModule = {
      id: 'B',
      start: () => ({ stop: stopB, getData: () => ({ active: 'B' }) } as TaskModuleHandle),
    };
    const runner = new TaskModuleRunner();
    runner.start({ module: modA, address: { scope: 'block', blockIndex: 1, trialIndex: null }, config: {}, context: {} });
    runner.start({ module: modB, address: { scope: 'trial', blockIndex: 1, trialIndex: 3 }, config: {}, context: {} });

    const before = runner.getActiveData();
    const stopped = runner.stopAll();
    const after = runner.getActiveData();

    expect(before).toHaveLength(2);
    expect(stopped).toHaveLength(2);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
    expect(after).toHaveLength(0);
  });

  it('getActiveHandle should return exact scoped handle match', () => {
    const handle = { stop: () => ({ ok: true }), getData: () => ({ ok: true }), controller: { id: 'ctrl' } } as any;
    const module: TaskModule = { id: 'drt', start: () => handle };
    const runner = new TaskModuleRunner();
    runner.start({
      module,
      address: { scope: 'trial', blockIndex: 2, trialIndex: 4 },
      config: { enabled: true, scope: 'trial' },
      context: {},
    });

    const found = runner.getActiveHandle({
      moduleId: 'drt',
      scope: 'trial',
      blockIndex: 2,
      trialIndex: 4,
    });
    const missing = runner.getActiveHandle({
      moduleId: 'drt',
      scope: 'trial',
      blockIndex: 2,
      trialIndex: 5,
    });

    expect(found).toBe(handle);
    expect((found as any)?.controller).toEqual({ id: 'ctrl' });
    expect(missing).toBeNull();
  });
});
