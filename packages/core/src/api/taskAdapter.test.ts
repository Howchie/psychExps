import { describe, it, expect, vi } from 'vitest';
// We'll import these from where they WILL be.
// Since they don't exist yet, this will fail to compile/run, which is a good 'Red' phase.
import { LifecycleManager, TaskAdapter } from './taskAdapter';

describe('LifecycleManager', () => {
  it('should handle the full lifecycle of a task adapter', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue({ result: 'success' }),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {} as any,
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {}
    };
    const manager = new LifecycleManager(mockAdapter);

    const result = await manager.run(context);

    expect(mockAdapter.initialize).toHaveBeenCalledWith(expect.objectContaining({
      taskConfig: {}
    }));
    expect(mockAdapter.execute).toHaveBeenCalled();
    expect(mockAdapter.terminate).toHaveBeenCalled();
    expect(result).toEqual({ result: 'success' });
  });

  it('should terminate even if execution fails', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockRejectedValue(new Error('execution failed')),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {} as any,
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {}
    };
    const manager = new LifecycleManager(mockAdapter);

    await expect(manager.run(context)).rejects.toThrow('execution failed');

    expect(mockAdapter.initialize).toHaveBeenCalled();
    expect(mockAdapter.terminate).toHaveBeenCalled();
  });

  it('should resolve variables in the configuration before calling initialize', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue('ok'),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {},
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {
        variables: {
          myVar: 'ResolvedValue'
        },
        field: '$var.myVar'
      }
    };

    const manager = new LifecycleManager(mockAdapter);
    await manager.run(context);

    expect(mockAdapter.initialize).toHaveBeenCalledWith(expect.objectContaining({
      taskConfig: expect.objectContaining({
        field: 'ResolvedValue'
      })
    }));
  });

  it('should resolve variables from task.variables and top-level variables', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue('ok'),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {},
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {
        task: {
          variables: { a: 'A' }
        },
        variables: { b: 'B' },
        f1: '$var.a',
        f2: '$var.b'
      }
    };

    const manager = new LifecycleManager(mockAdapter);
    await manager.run(context);

    expect(mockAdapter.initialize).toHaveBeenCalledWith(expect.objectContaining({
      taskConfig: expect.objectContaining({
        f1: 'A',
        f2: 'B'
      })
    }));
  });

  it('should resolve namespaces correctly', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue('ok'),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {},
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {
        variables: {
          between: { pm: 'food' }
        },
        field: '$between.pm'
      }
    };

    const manager = new LifecycleManager(mockAdapter);
    await manager.run(context);

    expect(mockAdapter.initialize).toHaveBeenCalledWith(expect.objectContaining({
      taskConfig: expect.objectContaining({
        field: 'food'
      })
    }));
  });

  it('should NOT resolve block-scoped variables at the high level', async () => {
    const mockAdapter: any = {
      manifest: { taskId: 'test' },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: vi.fn().mockResolvedValue('ok'),
      terminate: vi.fn().mockResolvedValue(undefined),
    };

    const context: any = {
      container: {},
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: {
        variables: {
          blockVar: { scope: 'block', value: 'BlockValue' },
          partVar: { scope: 'participant', value: 'PartValue' }
        },
        f1: '$var.blockVar',
        f2: '$var.partVar'
      }
    };

    const manager = new LifecycleManager(mockAdapter);
    await manager.run(context);

    expect(mockAdapter.initialize).toHaveBeenCalledWith(expect.objectContaining({
      taskConfig: expect.objectContaining({
        f1: '$var.blockVar',
        f2: 'PartValue'
      })
    }));
  });
});
