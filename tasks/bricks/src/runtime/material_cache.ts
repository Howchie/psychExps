// @ts-nocheck
import * as PIXI from 'pixi.js';

const imageTexturePromiseCache = new Map();
const proceduralTextureCacheByRenderer = new WeakMap();

const stableStringify = (value) => {
  const seen = new WeakSet();
  const walk = (node) => {
    if (!node || typeof node !== 'object') {
      return node;
    }
    if (seen.has(node)) {
      return null;
    }
    seen.add(node);
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    const out = {};
    Object.keys(node).sort().forEach((key) => {
      out[key] = walk(node[key]);
    });
    return out;
  };
  return JSON.stringify(walk(value));
};

export const makeMaterialKey = (kind, config, seed = 0) => {
  return `${String(kind)}::${String(seed >>> 0)}::${stableStringify(config ?? null)}`;
};

export const loadCachedImageTexture = async (src) => {
  const key = String(src || '').trim();
  if (!key) {
    return null;
  }
  if (!imageTexturePromiseCache.has(key)) {
    const promise = (async () => {
      if (PIXI.Assets && typeof PIXI.Assets.load === 'function') {
        return PIXI.Assets.load(key);
      }
      const tex = PIXI.Texture.from(key);
      if (!tex.baseTexture.valid) {
        await new Promise((resolve) => {
          const done = () => resolve(null);
          tex.baseTexture.once('loaded', done);
          tex.baseTexture.once('update', done);
          tex.baseTexture.once('error', done);
        });
      }
      return tex;
    })();
    imageTexturePromiseCache.set(key, promise);
  }
  return imageTexturePromiseCache.get(key);
};

export const getOrCreateProceduralTexture = (renderer, cacheKey, factory) => {
  if (!renderer || typeof factory !== 'function') {
    return null;
  }
  let byKey = proceduralTextureCacheByRenderer.get(renderer);
  if (!byKey) {
    byKey = new Map();
    proceduralTextureCacheByRenderer.set(renderer, byKey);
  }
  if (byKey.has(cacheKey)) {
    return byKey.get(cacheKey);
  }
  const texture = factory();
  byKey.set(cacheKey, texture);
  return texture;
};
