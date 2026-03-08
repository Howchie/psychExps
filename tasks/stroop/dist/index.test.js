/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { stroopAdapter } from './index';
import { createVariableResolver } from '@experiments/core';
describe('StroopTaskAdapter', () => {
    it('should initialize correctly', async () => {
        const taskConfig = {
            plan: {
                blocks: [{ label: 'B1', trials: 10 }]
            }
        };
        const resolver = createVariableResolver({ variables: {} });
        const context = {
            container: document.createElement('div'),
            selection: {
                participant: { participantId: 'p1', sessionId: 's1' },
                variantId: 'v1'
            },
            taskConfig: taskConfig,
            resolver: resolver
        };
        await stroopAdapter.initialize(context);
        expect(stroopAdapter.context).toBe(context);
    });
});
//# sourceMappingURL=index.test.js.map