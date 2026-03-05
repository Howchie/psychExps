export interface RNG {
    next(): number;
}
export interface ScheduleSpec {
    mode?: "weighted" | "sequence" | "quota_shuffle" | "block_quota_shuffle";
    sequence?: Array<string | number>;
    withoutReplacement?: boolean;
    without_replacement?: boolean;
}
export interface BuildScheduledItemsArgs<TItem> {
    items: TItem[];
    count: number;
    schedule?: ScheduleSpec | null;
    weights?: number[];
    rng?: RNG;
    resolveToken?: (token: string | number) => TItem | null;
    onInvalidToken?: (token: string | number) => void;
}
export declare function buildScheduledItems<T>(args: BuildScheduledItemsArgs<T>): T[];
