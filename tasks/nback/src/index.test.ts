/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { nbackAdapter } from './index';
import { createVariableResolver } from '@experiments/core';

describe('NbackTaskAdapter', () => {
  it('should initialize correctly using the provided resolver', async () => {
    const taskConfig = {
      mapping: { targetKey: 'm', nonTargetKey: 'z' },
      plan: {
        blocks: [
          { phase: 'main', nLevel: 1, trials: 10 }
        ]
      },
      variables: {
        myCat: 'food'
      }
    };

    const resolver = createVariableResolver({
      variables: taskConfig.variables
    });

    const mockModuleRunner = {
      transformPlan: vi.fn().mockImplementation((plan) => plan),
      transformBlockPlan: vi.fn().mockImplementation((block) => block),
      initialize: vi.fn(),
      terminate: vi.fn()
    };

    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: taskConfig,
      rawTaskConfig: taskConfig,
      resolver: resolver,
      moduleRunner: mockModuleRunner,
      stimuliByCategory: {}
    };

    await nbackAdapter.initialize(context);

    // Verify that blocks were parsed
    const runtime = (nbackAdapter as any).runtime;
    expect(runtime.parsed.mainBlocks[0].nLevel).toBe(1);
    expect(mockModuleRunner.transformBlockPlan).toHaveBeenCalled();
  });
});
