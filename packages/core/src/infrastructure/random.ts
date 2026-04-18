export interface SeededRng {
  next(): number;
}

export interface CoreRng extends SeededRng {
  nextFloat(): number;
  nextRange(min: number, max: number): number;
  nextNormal(mu?: number, sigma?: number): number;
}

export function hashSeed(...parts: string[]): number {
  let hash = 2166136261 >>> 0;
  for (const part of parts) {
    for (let i = 0; i < part.length; i += 1) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }
  return hash >>> 0;
}

export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export class SeededRandom {
  private readonly nextValue: () => number;

  constructor(seed: number) {
    this.nextValue = createMulberry32(seed);
  }

  next(): number {
    return this.nextValue();
  }

  int(minInclusive: number, maxInclusive: number): number {
    const lo = Math.min(minInclusive, maxInclusive);
    const hi = Math.max(minInclusive, maxInclusive);
    const width = hi - lo + 1;
    return lo + Math.floor(this.next() * width);
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
    return items;
  }
}

function sampleNormal(nextFloat: () => number, mu = 0, sigma = 1): number {
  if (sigma <= 0) {
    throw new Error(`RNG.nextNormal expects sigma > 0 (got ${sigma})`);
  }
  let u1 = 0;
  while (u1 === 0) {
    u1 = nextFloat();
  }
  const u2 = nextFloat();
  const mag = Math.sqrt(-2.0 * Math.log(u1));
  const z0 = mag * Math.cos(2.0 * Math.PI * u2);
  return mu + sigma * z0;
}

function parseSeed(value: unknown): number | null {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "random" || normalized === "auto") return null;
    if (/^\d+$/.test(normalized)) return Number(normalized) >>> 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? (numeric >>> 0) : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric >>> 0;
}

class SeededCoreRng implements CoreRng {
  private readonly random: SeededRandom;

  constructor(seed: number) {
    this.random = new SeededRandom(seed >>> 0);
  }

  next(): number {
    return Math.floor(this.random.next() * 0x100000000) >>> 0;
  }

  nextFloat(): number {
    return this.random.next();
  }

  nextRange(min: number, max: number): number {
    if (max <= min) {
      throw new Error(`RNG.nextRange expects max > min (got ${min}, ${max})`);
    }
    return min + (max - min) * this.nextFloat();
  }

  nextNormal(mu = 0, sigma = 1): number {
    return sampleNormal(() => this.nextFloat(), mu, sigma);
  }
}

/**
 * Generates a cryptographically secure random float in [0, 1).
 */
export function nextSecureFloat(): number {
  const array = new Uint32Array(1);
  globalThis.crypto.getRandomValues(array);
  return array[0] / 4294967296;
}

/**
 * Generates a cryptographically secure random 32-bit unsigned integer.
 */
export function nextSecureUint32(): number {
  const array = new Uint32Array(1);
  globalThis.crypto.getRandomValues(array);
  return array[0] >>> 0;
}

function createUnseededCoreRng(): CoreRng {
  return {
    next: nextSecureUint32,
    nextFloat: nextSecureFloat,
    nextRange: (min: number, max: number) => {
      if (max <= min) {
        throw new Error(`RNG.nextRange expects max > min (got ${min}, ${max})`);
      }
      return min + (max - min) * nextSecureFloat();
    },
    nextNormal: (mu = 0, sigma = 1) => sampleNormal(nextSecureFloat, mu, sigma),
  };
}

export function createCoreRng(seed?: unknown): CoreRng {
  const parsedSeed = parseSeed(seed);
  if (parsedSeed == null) return createUnseededCoreRng();
  return new SeededCoreRng(parsedSeed);
}
