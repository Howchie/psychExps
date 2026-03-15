/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { trackingAdapter } from './index';
describe('trackingAdapter', () => {
    it('exposes manifest and lifecycle hooks', () => {
        expect(trackingAdapter.manifest.taskId).toBe('tracking');
        expect(typeof trackingAdapter.initialize).toBe('function');
        expect(typeof trackingAdapter.execute).toBe('function');
        expect(typeof trackingAdapter.terminate).toBe('function');
    });
});
//# sourceMappingURL=index.test.js.map