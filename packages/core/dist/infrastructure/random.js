export function hashSeed(...parts) {
    let hash = 2166136261 >>> 0;
    for (const part of parts) {
        for (let i = 0; i < part.length; i += 1) {
            hash ^= part.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
    }
    return hash >>> 0;
}
export function createMulberry32(seed) {
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
    nextValue;
    constructor(seed) {
        this.nextValue = createMulberry32(seed);
    }
    next() {
        return this.nextValue();
    }
    int(minInclusive, maxInclusive) {
        const lo = Math.min(minInclusive, maxInclusive);
        const hi = Math.max(minInclusive, maxInclusive);
        const width = hi - lo + 1;
        return lo + Math.floor(this.next() * width);
    }
    shuffle(items) {
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = this.int(0, i);
            const tmp = items[i];
            items[i] = items[j];
            items[j] = tmp;
        }
        return items;
    }
}
//# sourceMappingURL=random.js.map