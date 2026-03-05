import { deepClone, deepMerge } from "../infrastructure/deepMerge";
import { SeededRandom, hashSeed } from "../infrastructure/random";
import { asArray, asObject, asString } from "../utils/coerce";
import type { JSONObject } from "../api/types";

export interface ManipulationPoolAllocator {
  next(poolId: string): string[] | null;
}

export function createManipulationOverrideMap(value: unknown): Map<string, JSONObject> {
  const out = new Map<string, JSONObject>();
  for (const entry of asArray(value)) {
    const parsed = asObject(entry);
    if (!parsed) continue;
    const id = asString(parsed.id);
    if (!id) continue;
    const overrides = asObject(parsed.overrides) ?? {};
    out.set(id, deepClone(overrides) as JSONObject);
  }
  return out;
}

export function createManipulationPoolAllocator(value: unknown, seedParts: string[]): ManipulationPoolAllocator {
  const poolsRaw = asObject(value);
  const pools = new Map<string, string[][]>();
  if (poolsRaw) {
    for (const [poolId, entriesRaw] of Object.entries(poolsRaw)) {
      const entries: string[][] = [];
      for (const entry of asArray(entriesRaw)) {
        const single = asString(entry);
        if (single) {
          entries.push([single]);
          continue;
        }
        const list = asArray(entry).map((v) => asString(v)).filter((v): v is string => Boolean(v));
        if (list.length > 0) entries.push(list);
      }
      if (entries.length > 0) pools.set(poolId, entries);
    }
  }

  const rng = new SeededRandom(hashSeed(...seedParts));
  const queueByPool = new Map<string, string[][]>();

  return {
    next(poolId: string): string[] | null {
      const source = pools.get(poolId);
      if (!source || source.length === 0) return null;
      let queue = queueByPool.get(poolId) ?? [];
      if (queue.length === 0) {
        queue = source.map((entry) => [...entry]);
        rng.shuffle(queue);
      }
      const picked = queue.shift() ?? null;
      queueByPool.set(poolId, queue);
      return picked ? [...picked] : null;
    },
  };
}

export function resolveBlockManipulationIds(blockLike: unknown, poolAllocator?: ManipulationPoolAllocator): string[] {
  const block = asObject(blockLike);
  if (!block) return [];
  const out: string[] = [];

  const poolId = asString(block.manipulationPool);
  if (poolId) {
    const fromPool = poolAllocator?.next(poolId) ?? null;
    if (fromPool && fromPool.length > 0) out.push(...fromPool);
  }

  const single = asString(block.manipulation);
  if (single) out.push(single);

  for (const idLike of asArray(block.manipulations)) {
    const id = asString(idLike);
    if (id) out.push(id);
  }

  return out;
}

export function applyManipulationOverridesToBlock(
  blockLike: unknown,
  manipulationIds: string[],
  manipulationOverrides: Map<string, JSONObject>,
  errorContext: string,
): unknown {
  const block = asObject(blockLike);
  if (!block || manipulationIds.length === 0) return blockLike;
  const merged = deepClone(block) as JSONObject;
  for (const manipulationId of manipulationIds) {
    const overrides = manipulationOverrides.get(manipulationId);
    if (!overrides) {
      throw new Error(`${errorContext}: unknown manipulation '${manipulationId}'.`);
    }
    deepMerge(merged, overrides);
  }
  return merged;
}
