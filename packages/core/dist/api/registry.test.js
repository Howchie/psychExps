import { describe, it, expect } from 'vitest';
import { buildTaskMap, getVariantOrThrow } from './registry';
describe('task registry', () => {
    const mockAdapter = {
        manifest: {
            taskId: 'test-task',
            label: 'Test Task',
            variants: [
                { id: 'v1', label: 'Variant 1' },
                { id: 'v2', label: 'Variant 2' },
            ],
        },
        initialize: async () => { },
        execute: async () => ({}),
        terminate: async () => { },
    };
    describe('buildTaskMap', () => {
        it('should map task IDs to adapters', () => {
            const map = buildTaskMap([mockAdapter]);
            expect(map.get('test-task')).toBe(mockAdapter);
        });
    });
    describe('getVariantOrThrow', () => {
        it('should resolve a valid variant', () => {
            const variant = getVariantOrThrow(mockAdapter, 'v1');
            expect(variant.id).toBe('v1');
        });
        it('should throw for unknown variant', () => {
            expect(() => getVariantOrThrow(mockAdapter, 'unknown')).toThrow("Unknown variant 'unknown'");
        });
    });
});
//# sourceMappingURL=registry.test.js.map