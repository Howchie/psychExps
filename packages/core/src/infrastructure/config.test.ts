import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager, parseOverridesFromUrl } from './config';

describe('parseOverridesFromUrl', () => {
  it('should return null if overrides parameter is missing', () => {
    const params = new URLSearchParams('');
    expect(parseOverridesFromUrl(params)).toBeNull();
  });

  it('should parse a valid JSON object', () => {
    const validJson = JSON.stringify({ a: 1, b: 'test' });
    const params = new URLSearchParams(`overrides=${encodeURIComponent(validJson)}`);
    expect(parseOverridesFromUrl(params)).toEqual({ a: 1, b: 'test' });
  });

  it('should return null for malformed URL encoding', () => {
    // %E0%A4%A is malformed URI
    const params = new URLSearchParams('overrides=%E0%A4%A');
    expect(parseOverridesFromUrl(params)).toBeNull();
  });

  it('should return null for malformed JSON', () => {
    const invalidJson = '{a:1';
    const params = new URLSearchParams(`overrides=${encodeURIComponent(invalidJson)}`);
    expect(parseOverridesFromUrl(params)).toBeNull();
  });

  it('should return null if parsed JSON is an array', () => {
    const arrayJson = JSON.stringify([1, 2, 3]);
    const params = new URLSearchParams(`overrides=${encodeURIComponent(arrayJson)}`);
    expect(parseOverridesFromUrl(params)).toBeNull();
  });

  it('should return null if parsed JSON is a primitive', () => {
    const primitiveJson = JSON.stringify('test');
    const params = new URLSearchParams(`overrides=${encodeURIComponent(primitiveJson)}`);
    expect(parseOverridesFromUrl(params)).toBeNull();
  });

  it('should return null if parsed JSON is null', () => {
    const nullJson = JSON.stringify(null);
    const params = new URLSearchParams(`overrides=${encodeURIComponent(nullJson)}`);
    expect(parseOverridesFromUrl(params)).toBeNull();
  });
});

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

  describe('validateLegacyKeys', () => {
    it('should throw error if top-level drt key is present', () => {
      const manager = new ConfigurationManager();
      const config = { drt: { enabled: true } };
      expect(() => manager.validateLegacyKeys(config)).toThrow("Legacy configuration detected: Top-level 'drt' key is no longer supported.");
    });

    it('should throw error if top-level pm key is present', () => {
      const manager = new ConfigurationManager();
      const config = { pm: { enabled: true } };
      expect(() => manager.validateLegacyKeys(config)).toThrow("Legacy configuration detected: Top-level 'pm' key is no longer supported.");
    });

    it('should not throw if no legacy keys are present', () => {
      const manager = new ConfigurationManager();
      const config = { task: { modules: { drt: {} } } };
      expect(() => manager.validateLegacyKeys(config)).not.toThrow();
    });
  });

  describe('loading', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    it('should load JSON from a path', async () => {
      const mockConfig = { foo: 'bar' };
      (fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      });

      const manager = new ConfigurationManager();
      const loaded = await manager.load('/config.json');

      expect(loaded).toEqual(mockConfig);
      expect(fetch).toHaveBeenCalledWith('/config.json', expect.anything());
    });

    it('should throw on fetch error', async () => {
      (fetch as any).mockResolvedValue({
        ok: false,
        status: 404
      });

      const manager = new ConfigurationManager();
      await expect(manager.load('/config.json')).rejects.toThrow('Failed to load config');
    });
  });

  describe('resolve', () => {
    it('should recursively resolve variables in the configuration', () => {
      const manager = new ConfigurationManager();
      const config = {
        foo: '$var.a',
        bar: {
          baz: '$var.b',
          qux: [1, '$var.c', 3]
        }
      };

      const mockResolver = {
        resolveInValue: vi.fn((val) => {
          if (val === '$var.a') return 'A';
          if (val === '$var.b') return 'B';
          if (val === '$var.c') return 'C';
          if (typeof val === 'object' && val !== null) {
            if (Array.isArray(val)) return val.map(mockResolver.resolveInValue);
            const out: any = {};
            for (const [k, v] of Object.entries(val)) {
              out[k] = mockResolver.resolveInValue(v);
            }
            return out;
          }
          return val;
        })
      };

      const resolved = (manager as any).resolve(config, mockResolver);

      expect(resolved).toEqual({
        foo: 'A',
        bar: {
          baz: 'B',
          qux: [1, 'C', 3]
        }
      });
      expect(mockResolver.resolveInValue).toHaveBeenCalled();
    });
  });
});
