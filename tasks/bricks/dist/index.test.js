/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { bricksAdapter } from './index';
import { createVariableResolver, TaskOrchestrator } from '@experiments/core';
vi.mock('@experiments/core', async () => {
    const actual = await vi.importActual('@experiments/core');
    return {
        ...actual,
        TaskOrchestrator: vi.fn().mockImplementation(function () {
            this.run = vi.fn().mockResolvedValue({ status: 'complete' });
        })
    };
});
describe('BricksTaskAdapter', () => {
    it('should initialize and execute using TaskOrchestrator', async () => {
        const taskConfig = {
            task: { title: 'Test' },
            blocks: [{ label: 'B1', trials: 10 }]
        };
        const resolver = createVariableResolver({ variables: {} });
        const mockModuleRunner = {
            setOptions: vi.fn(),
            getResults: vi.fn().mockReturnValue([]),
            getActiveData: vi.fn().mockReturnValue([])
        };
        const context = {
            container: document.createElement('div'),
            selection: {
                participant: { participantId: 'p1', sessionId: 's1' },
                variantId: 'annikaHons'
            },
            taskConfig: taskConfig,
            rawTaskConfig: taskConfig,
            resolver: resolver,
            moduleRunner: mockModuleRunner
        };
        await bricksAdapter.initialize(context);
        const result = await bricksAdapter.execute();
        expect(result).toEqual({ status: 'complete' });
        expect(TaskOrchestrator).toHaveBeenCalledWith(context);
    });
});
//# sourceMappingURL=index.test.js.map