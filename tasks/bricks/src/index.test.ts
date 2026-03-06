/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { bricksAdapter } from './index';
import { createVariableResolver } from '@experiments/core';

describe('BricksTaskAdapter', () => {
  it('should initialize correctly', async () => {
    const taskConfig = {
      plan: {
        blocks: [{ index: 0, label: 'B1', trials: 10, trialConfigs: [] }]
      }
    };

    const resolver = createVariableResolver({ variables: {} });

    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: taskConfig,
      resolver: resolver
    };

    await bricksAdapter.initialize(context);
    expect((bricksAdapter as any).context).toBe(context);
  });
});
