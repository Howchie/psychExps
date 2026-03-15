/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { sftAdapter } from './index';
describe('sftAdapter', () => {
    it('exposes manifest and lifecycle hooks', () => {
        expect(sftAdapter.manifest.taskId).toBe('sft');
        expect(typeof sftAdapter.initialize).toBe('function');
        expect(typeof sftAdapter.execute).toBe('function');
        expect(typeof sftAdapter.terminate).toBe('function');
    });
});
//# sourceMappingURL=index.test.js.map