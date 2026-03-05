// @ts-nocheck
/**
 * Lightweight seeded pseudo-random number generator (Mulberry32 variant).
 * Having our own RNG keeps stimulus timing deterministic when we replay trials.
 */
export class RNG {
  constructor(seed) {
    // Clamp seed into uint32 range to avoid negative or non-integer values.
    const s = Number(seed) >>> 0;
    this._state = s === 0 ? 0x6d2b79f5 : s;
  }

  /**
   * Returns an unsigned 32-bit integer in [0, 2^32 - 1].
   */
  next() {
    // Mulberry32 algorithm: simple, fast, good quality for experimental use.
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = (t ^ (t >>> 14)) >>> 0;
    this._state = result;
    return result;
  }

  /**
   * Returns a float in [0, 1).
   */
  nextFloat() {
    return this.next() / 0x100000000;
  }

  /**
   * Returns a float uniformly sampled from [min, max).
   */
  nextRange(min, max) {
    if (max <= min) {
      throw new Error(`RNG.nextRange expects max > min (got ${min}, ${max})`);
    }
    return min + (max - min) * this.nextFloat();
  }

  /**
   * Returns a normally distributed sample using Box-Muller transform.
   */
  nextNormal(mu = 0, sigma = 1) {
    if (sigma <= 0) {
      throw new Error(`RNG.nextNormal expects sigma > 0 (got ${sigma})`);
    }
    // Avoid log(0) by ensuring u1 is > 0.
    let u1 = 0;
    while (u1 === 0) {
      u1 = this.nextFloat();
    }
    const u2 = this.nextFloat();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    return mu + sigma * z0;
  }
}

/**
 * Convenience factory that mimics Math.random when no seed is supplied.
 */
export const makeRNG = (seed) => {
  // Normalize common string-based controls for randomness.
  if (typeof seed === 'string') {
    const s = seed.trim().toLowerCase();
    if (s === 'random' || s === 'auto') {
      seed = undefined;
    } else if (/^\d+$/.test(s)) {
      seed = Number(s);
    }
  }

  if (seed === undefined || seed === null) {
    return {
      next: () => Math.floor(Math.random() * 0x100000000) >>> 0,
      nextFloat: () => Math.random(),
      nextRange: (min, max) => min + (max - min) * Math.random(),
      nextNormal: (mu = 0, sigma = 1) => {
        // Box-Muller using Math.random.
        let u1 = 0;
        while (u1 === 0) {
          u1 = Math.random();
        }
        const u2 = Math.random();
        const mag = Math.sqrt(-2.0 * Math.log(u1));
        const z0 = mag * Math.cos(2.0 * Math.PI * u2);
        return mu + sigma * z0;
      }
    };
  }
  return new RNG(seed);
};
