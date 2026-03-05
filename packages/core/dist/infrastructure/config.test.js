import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager } from './config';
describe('ConfigurationManager', () => {
    const base = { a: 1, b: { c: 2 } };
    const taskDefault = { b: { d: 3 }, e: 4 };
    const variant = { e: 5, f: 6 };
    const runtime = { f: 7 };
    it('should merge configurations correctly in sequence', () => {
        const manager = new ConfigurationManager();
        const merged = manager.merge(base, taskDefault, variant, runtime);
        expect(merged).toEqual({
            a: 1,
            b: { c: 2, d: 3 },
            e: 5,
            f: 7
        });
    });
    it('should handle null/undefined runtime overrides', () => {
        const manager = new ConfigurationManager();
        const merged = manager.merge(base, taskDefault, variant, null);
        expect(merged).toEqual({
            a: 1,
            b: { c: 2, d: 3 },
            e: 5,
            f: 6
        });
    });
    describe('loading', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn());
        });
        it('should load JSON from a path', async () => {
            const mockConfig = { foo: 'bar' };
            fetch.mockResolvedValue({
                ok: true,
                json: async () => mockConfig
            });
            const manager = new ConfigurationManager();
            const loaded = await manager.load('/config.json');
            expect(loaded).toEqual(mockConfig);
            expect(fetch).toHaveBeenCalledWith('/config.json', expect.anything());
        });
        it('should throw on fetch error', async () => {
            fetch.mockResolvedValue({
                ok: false,
                status: 404
            });
            const manager = new ConfigurationManager();
            await expect(manager.load('/config.json')).rejects.toThrow('Failed to load config');
        });
    });
});
//# sourceMappingURL=config.test.js.map