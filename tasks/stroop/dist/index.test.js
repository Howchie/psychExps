/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { stroopAdapter } from './index';
describe('stroopAdapter', () => {
    it('exposes manifest and lifecycle hooks', () => {
        expect(stroopAdapter.manifest.taskId).toBe('stroop');
        expect(typeof stroopAdapter.initialize).toBe('function');
        expect(typeof stroopAdapter.execute).toBe('function');
        expect(typeof stroopAdapter.terminate).toBe('function');
    });
});
//# sourceMappingURL=index.test.js.map