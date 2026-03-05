import { deepClone, deepMerge } from "./deepMerge";
import { SeededRandom, hashSeed } from "./random";
import { asArray, asObject, asString } from "./coerce";
export function createManipulationOverrideMap(value) {
    const out = new Map();
    for (const entry of asArray(value)) {
        const parsed = asObject(entry);
        if (!parsed)
            continue;
        const id = asString(parsed.id);
        if (!id)
            continue;
        const overrides = asObject(parsed.overrides) ?? {};
        out.set(id, deepClone(overrides));
    }
    return out;
}
export function createManipulationPoolAllocator(value, seedParts) {
    const poolsRaw = asObject(value);
    const pools = new Map();
    if (poolsRaw) {
        for (const [poolId, entriesRaw] of Object.entries(poolsRaw)) {
            const entries = [];
            for (const entry of asArray(entriesRaw)) {
                const single = asString(entry);
                if (single) {
                    entries.push([single]);
                    continue;
                }
                const list = asArray(entry).map((v) => asString(v)).filter((v) => Boolean(v));
                if (list.length > 0)
                    entries.push(list);
            }
            if (entries.length > 0)
                pools.set(poolId, entries);
        }
    }
    const rng = new SeededRandom(hashSeed(...seedParts));
    const queueByPool = new Map();
    return {
        next(poolId) {
            const source = pools.get(poolId);
            if (!source || source.length === 0)
                return null;
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
export function resolveBlockManipulationIds(blockLike, poolAllocator) {
    const block = asObject(blockLike);
    if (!block)
        return [];
    const out = [];
    const poolId = asString(block.manipulationPool);
    if (poolId) {
        const fromPool = poolAllocator?.next(poolId) ?? null;
        if (fromPool && fromPool.length > 0)
            out.push(...fromPool);
    }
    const single = asString(block.manipulation);
    if (single)
        out.push(single);
    for (const idLike of asArray(block.manipulations)) {
        const id = asString(idLike);
        if (id)
            out.push(id);
    }
    return out;
}
export function applyManipulationOverridesToBlock(blockLike, manipulationIds, manipulationOverrides, errorContext) {
    const block = asObject(blockLike);
    if (!block || manipulationIds.length === 0)
        return blockLike;
    const merged = deepClone(block);
    for (const manipulationId of manipulationIds) {
        const overrides = manipulationOverrides.get(manipulationId);
        if (!overrides) {
            throw new Error(`${errorContext}: unknown manipulation '${manipulationId}'.`);
        }
        deepMerge(merged, overrides);
    }
    return merged;
}
//# sourceMappingURL=manipulations.js.map