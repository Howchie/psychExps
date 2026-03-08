/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { trackingAdapter } from './index';
import { createVariableResolver } from '@experiments/core';

describe('TrackingTaskAdapter', () => {
  it('should initialize correctly', async () => {
    const taskConfig = {
      design: {
        manipulations: [{ id: 'm1', trial_plan: { mode: 'pursuit', variants: [] } }],
        blocks: [{ id: 'b1', manipulation: 'm1', n_trials: 10 }]
      }
    };

    const resolver = createVariableResolver({ variables: {} });

    const moduleRunner = { sentinel: true };
    const context: any = {
      container: document.createElement('div'),
      selection: {
        participant: { participantId: 'p1', sessionId: 's1' },
        variantId: 'v1'
      },
      taskConfig: taskConfig,
      resolver: resolver,
      moduleRunner,
    };

    await trackingAdapter.initialize(context);
    expect((trackingAdapter as any).context).toBe(context);
    expect((trackingAdapter as any).context.moduleRunner).toBe(moduleRunner);
    expect((trackingAdapter as any).runner).toBeUndefined();
  });
});
