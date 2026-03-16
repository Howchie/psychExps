const defaultRng = { next: () => Math.random() };
const asObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
function pickWeightedIndex(weights, rng) {
    let total = 0;
    for (let i = 0; i < weights.length; i += 1) {
        total += weights[i];
    }
    if (!(total > 0)) {
        return Math.floor(rng.next() * weights.length);
    }
    let threshold = rng.next() * total;
    for (let i = 0; i < weights.length; i += 1) {
        threshold -= weights[i];
        if (threshold <= 0 || i === weights.length - 1)
            return i;
    }
    return weights.length - 1;
}
function shuffleInPlace(items, rng) {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
function computeQuotaCounts(weights, totalCount) {
    let sum = 0;
    for (let i = 0; i < weights.length; i += 1) {
        sum += weights[i];
    }
    if (!(sum > 0) || totalCount <= 0)
        return weights.map(() => 0);
    const raw = weights.map((weight) => (weight / sum) * totalCount);
    const base = raw.map((value) => Math.floor(value));
    let assigned = 0;
    for (let i = 0; i < base.length; i += 1) {
        assigned += base[i];
    }
    if (assigned < totalCount) {
        const ranked = raw
            .map((value, index) => ({ index, remainder: value - base[index] }))
            .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        let cursor = 0;
        while (assigned < totalCount) {
            const next = ranked[cursor % ranked.length];
            base[next.index] += 1;
            assigned += 1;
            cursor += 1;
        }
    }
    return base;
}
function buildQuotaShuffleSchedule(items, weights, count, rng) {
    const counts = computeQuotaCounts(weights, count);
    const output = [];
    items.forEach((item, index) => {
        const n = counts[index] ?? 0;
        for (let i = 0; i < n; i += 1)
            output.push(item);
    });
    return shuffleInPlace(output, rng);
}
function buildWeightedPermutation(items, weights, rng) {
    const remainingItems = items.slice();
    const remainingWeights = weights.slice();
    const output = [];
    let totalWeight = 0;
    for (let i = 0; i < remainingWeights.length; i += 1) {
        totalWeight += remainingWeights[i];
    }
    while (remainingItems.length > 0) {
        let index = 0;
        if (totalWeight > 0) {
            let threshold = rng.next() * totalWeight;
            for (let i = 0; i < remainingWeights.length; i += 1) {
                threshold -= remainingWeights[i];
                if (threshold <= 0 || i === remainingWeights.length - 1) {
                    index = i;
                    break;
                }
            }
        }
        else {
            index = Math.floor(rng.next() * remainingItems.length);
        }
        output.push(remainingItems[index]);
        const lastIndex = remainingItems.length - 1;
        totalWeight -= remainingWeights[index];
        if (index !== lastIndex) {
            remainingItems[index] = remainingItems[lastIndex];
            remainingWeights[index] = remainingWeights[lastIndex];
        }
        remainingItems.pop();
        remainingWeights.pop();
    }
    return output;
}
export function buildScheduledItems(args) {
    const { items, count, schedule, weights, rng = defaultRng, resolveToken, onInvalidToken, } = args;
    if (!Array.isArray(items) || items.length === 0 || count <= 0)
        return [];
    const scheduleSpec = asObject(schedule) ? schedule : {};
    const mode = String(scheduleSpec.mode ?? "weighted").trim().toLowerCase();
    const itemWeights = Array.isArray(weights) && weights.length === items.length
        ? weights.map((value) => Number(value))
        : items.map(() => 1);
    if (mode === "sequence") {
        const sequence = Array.isArray(scheduleSpec.sequence) && scheduleSpec.sequence.length > 0
            ? scheduleSpec.sequence
            : items.map((_, idx) => idx);
        return Array.from({ length: count }, (_, index) => {
            const token = sequence[index % sequence.length];
            const resolved = resolveToken ? resolveToken(token) : null;
            if (resolved != null)
                return resolved;
            if (onInvalidToken)
                onInvalidToken(token);
            return items[0];
        });
    }
    if (mode === "quota_shuffle" || mode === "block_quota_shuffle") {
        return buildQuotaShuffleSchedule(items, itemWeights, count, rng);
    }
    const withoutReplacement = scheduleSpec.withoutReplacement === true || scheduleSpec.without_replacement === true;
    if (!withoutReplacement) {
        return Array.from({ length: count }, () => items[pickWeightedIndex(itemWeights, rng)]);
    }
    const output = [];
    let pool = [];
    for (let i = 0; i < count; i += 1) {
        if (pool.length === 0) {
            pool = buildWeightedPermutation(items, itemWeights, rng);
        }
        const next = pool.shift();
        if (next != null)
            output.push(next);
    }
    return output;
}
//# sourceMappingURL=scheduler.js.map