/**
 * Lightweight seeded pseudo-random number generator (Mulberry32 variant).
 * Having our own RNG keeps stimulus timing deterministic when we replay trials.
 */
export declare class RNG {
    constructor(seed: any);
    /**
     * Returns an unsigned 32-bit integer in [0, 2^32 - 1].
     */
    next(): number;
    /**
     * Returns a float in [0, 1).
     */
    nextFloat(): number;
    /**
     * Returns a float uniformly sampled from [min, max).
     */
    nextRange(min: any, max: any): any;
    /**
     * Returns a normally distributed sample using Box-Muller transform.
     */
    nextNormal(mu?: number, sigma?: number): number;
}
/**
 * Convenience factory that mimics Math.random when no seed is supplied.
 */
export declare const makeRNG: (seed: any) => RNG;
