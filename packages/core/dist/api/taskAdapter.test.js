import { describe, it, expect, vi } from 'vitest';
// We'll import these from where they WILL be.
// Since they don't exist yet, this will fail to compile/run, which is a good 'Red' phase.
import { LifecycleManager } from './taskAdapter';
describe('LifecycleManager', () => {
    it('should handle the full lifecycle of a task adapter', async () => {
        const mockAdapter = {
            initialize: vi.fn().mockResolvedValue(undefined),
            execute: vi.fn().mockResolvedValue({ result: 'success' }),
            terminate: vi.fn().mockResolvedValue(undefined),
        };
        const context = { container: {} };
        const manager = new LifecycleManager(mockAdapter);
        const result = await manager.run(context);
        expect(mockAdapter.initialize).toHaveBeenCalledWith(context);
        expect(mockAdapter.execute).toHaveBeenCalled();
        expect(mockAdapter.terminate).toHaveBeenCalled();
        expect(result).toEqual({ result: 'success' });
    });
    it('should terminate even if execution fails', async () => {
        const mockAdapter = {
            initialize: vi.fn().mockResolvedValue(undefined),
            execute: vi.fn().mockRejectedValue(new Error('execution failed')),
            terminate: vi.fn().mockResolvedValue(undefined),
        };
        const context = { container: {} };
        const manager = new LifecycleManager(mockAdapter);
        await expect(manager.run(context)).rejects.toThrow('execution failed');
        expect(mockAdapter.initialize).toHaveBeenCalled();
        expect(mockAdapter.terminate).toHaveBeenCalled();
    });
});
//# sourceMappingURL=taskAdapter.test.js.map