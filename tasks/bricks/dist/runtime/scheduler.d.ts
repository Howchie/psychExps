export declare const pickWeightedIndex: (weights: any, rng: any) => number;
export declare const shuffleInPlace: (items: any, rng: any) => any;
export declare const computeQuotaCounts: (weights: any, totalCount: any) => any;
export declare const buildQuotaShuffleSchedule: (items: any, weights: any, totalCount: any, rng: any) => any;
export declare const buildScheduledItems: ({ items, count, schedule, weights, rng, resolveToken, onInvalidToken }: {
    items: any;
    count: any;
    schedule: any;
    weights: any;
    rng: any;
    resolveToken: any;
    onInvalidToken: any;
}) => any;
