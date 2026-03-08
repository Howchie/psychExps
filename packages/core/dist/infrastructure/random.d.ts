export interface SeededRng {
    next(): number;
}
export interface CoreRng extends SeededRng {
    nextFloat(): number;
    nextRange(min: number, max: number): number;
    nextNormal(mu?: number, sigma?: number): number;
}
export declare function hashSeed(...parts: string[]): number;
export declare function createMulberry32(seed: number): () => number;
export declare class SeededRandom {
    private readonly nextValue;
    constructor(seed: number);
    next(): number;
    int(minInclusive: number, maxInclusive: number): number;
    shuffle<T>(items: T[]): T[];
}
export declare function createCoreRng(seed?: unknown): CoreRng;
