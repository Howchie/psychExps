export interface SeededRng {
  next(): number;
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
