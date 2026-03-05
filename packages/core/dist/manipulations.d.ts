import type { JSONObject } from "./types";
export interface ManipulationPoolAllocator {
    next(poolId: string): string[] | null;
}
export declare function createManipulationOverrideMap(value: unknown): Map<string, JSONObject>;
export declare function createManipulationPoolAllocator(value: unknown, seedParts: string[]): ManipulationPoolAllocator;
export declare function resolveBlockManipulationIds(blockLike: unknown, poolAllocator?: ManipulationPoolAllocator): string[];
export declare function applyManipulationOverridesToBlock(blockLike: unknown, manipulationIds: string[], manipulationOverrides: Map<string, JSONObject>, errorContext: string): unknown;
