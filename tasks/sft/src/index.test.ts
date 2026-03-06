/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { sftAdapter } from './index';
import { createVariableResolver } from '@experiments/core';

describe('SftTaskAdapter', () => {
  it('should initialize correctly', async () => {
    const taskConfig = {
      design: {
        manipulations: [
          { id: 'm1', trial_plan: { variants: [{ rule: 'OR', weight: 1 }] } }
        ],
        blocks: [
          { id: 'b1', manipulation: 'm1', n_trials: 10 }
        ]
      }
    };

    const resolver = createVariableResolver({
      variables: {}
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

    await sftAdapter.initialize(context);

    // Verify that context was stored
    expect((sftAdapter as any).context).toBe(context);
  });
});
