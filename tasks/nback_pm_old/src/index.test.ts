/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { pmAdapter } from './index';
import { createVariableResolver } from '@experiments/core';

describe('PmTaskAdapter', () => {
  it('should initialize correctly using the provided resolver', async () => {
    const taskConfig = {
      mapping: { targetKey: 'm', nonTargetKey: 'z', pmKey: 'space' },
      plan: {
        blocks: [
          { phase: 'main', blockType: 'pm', nLevel: 1, trials: 10, pmCount: 1, activePmCategories: ['$var.myCat'] }
        ]
      },
      variables: {
        myCat: 'food'
      }
    };

    const resolver = createVariableResolver({
      variables: taskConfig.variables
    });

    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: taskConfig,
      resolver: resolver
    };

    await pmAdapter.initialize(context);

    // Verify that blocks were parsed and variables resolved
    const runtime = (pmAdapter as any).runtime;
    expect(runtime.parsed.mainBlocks[0].activePmCategories).toEqual(['food']);
  });
});
