// @ts-nocheck
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
export const pickWeightedIndex = (weights, rng) => {
    const total = weights.reduce((acc, value) => acc + value, 0);
    if (!(total > 0)) {
        return Math.floor(rng.nextRange(0, weights.length));
    }
    let threshold = rng.nextRange(0, total);
    for (let i = 0; i < weights.length; i += 1) {
        threshold -= weights[i];
        if (threshold <= 0 || i === weights.length - 1) {
            return i;
        }
    }
    return weights.length - 1;
};
export const shuffleInPlace = (items, rng) => {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.nextRange(0, i + 1));
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
    }
    return items;
};
export const computeQuotaCounts = (weights, totalCount) => {
    const sum = weights.reduce((acc, value) => acc + value, 0);
    if (!(sum > 0) || totalCount <= 0) {
        return weights.map(() => 0);
    }
    const raw = weights.map((weight) => (weight / sum) * totalCount);
    const base = raw.map((value) => Math.floor(value));
    let assigned = base.reduce((acc, value) => acc + value, 0);
    if (assigned < totalCount) {
        const ranked = raw
            .map((value, index) => ({ index, remainder: value - base[index] }))
            .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
        let cursor = 0;
        while (assigned < totalCount) {
            const target = ranked[cursor % ranked.length];
            base[target.index] += 1;
            assigned += 1;
            cursor += 1;
        }
    }
    return base;
};
export const buildQuotaShuffleSchedule = (items, weights, totalCount, rng) => {
    const counts = computeQuotaCounts(weights, totalCount);
    const output = [];
    items.forEach((item, index) => {
        const n = counts[index] ?? 0;
        for (let i = 0; i < n; i += 1) {
            output.push(item);
        }
    });
    return shuffleInPlace(output, rng);
};
const buildWeightedPermutation = (items, weights, rng) => {
    const remainingItems = items.slice();
    const remainingWeights = weights.slice();
    const output = [];
    while (remainingItems.length > 0) {
        const index = pickWeightedIndex(remainingWeights, rng);
        output.push(remainingItems[index]);
        remainingItems.splice(index, 1);
        remainingWeights.splice(index, 1);
    }
    return output;
};
export const buildScheduledItems = ({ items, count, schedule, weights, rng, resolveToken, onInvalidToken }) => {
    if (!Array.isArray(items) || items.length === 0 || count <= 0) {
        return [];
    }
    const scheduleSpec = asObject(schedule) || {};
    const mode = String(scheduleSpec.mode ?? 'weighted').trim().toLowerCase();
    const itemWeights = Array.isArray(weights) && weights.length === items.length
        ? weights.map((value) => Number(value))
        : items.map(() => 1);
    if (mode === 'sequence') {
        const sequenceRaw = Array.isArray(scheduleSpec.sequence) && scheduleSpec.sequence.length > 0
            ? scheduleSpec.sequence
            : items.map((_, index) => index);
        return Array.from({ length: count }, (_, itemIndex) => {
            const token = sequenceRaw[itemIndex % sequenceRaw.length];
            const resolved = typeof resolveToken === 'function' ? resolveToken(token) : null;
            if (resolved != null) {
                return resolved;
            }
            if (typeof onInvalidToken === 'function') {
                onInvalidToken(token);
            }
            return items[0];
        });
    }
    if (mode === 'quota_shuffle' || mode === 'block_quota_shuffle') {
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
        output.push(pool.shift());
    }
    return output;
};
//# sourceMappingURL=scheduler.js.map