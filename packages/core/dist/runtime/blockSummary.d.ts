export type BlockSummaryPlacement = "block_end_before_post" | "block_end_after_post";
export interface BlockSummaryWhen {
    blockIndex?: number[];
    blockLabel?: string[];
    blockType?: string[];
    isPractice?: boolean;
}
export interface BlockSummaryMetrics {
    correctField: string;
    rtField: string;
}
export type BlockSummaryWhereValue = string | number | boolean;
export interface BlockSummaryWhere {
    [field: string]: BlockSummaryWhereValue | BlockSummaryWhereValue[];
}
export interface BlockSummaryConfig {
    enabled: boolean;
    at: BlockSummaryPlacement;
    title: string;
    lines: string[];
    when?: BlockSummaryWhen;
    where?: BlockSummaryWhere;
    metrics: BlockSummaryMetrics;
}
export interface BlockSummaryStats {
    total?: number;
    correct?: number;
    accuracyPct?: number;
    meanRtMs?: number;
    validRtCount?: number;
}
export interface BlockSummaryModel {
    at: BlockSummaryPlacement;
    title: string;
    lines: string[];
    text: string;
}
export declare function coerceBlockSummaryConfig(value: unknown): BlockSummaryConfig | null;
export declare function mergeBlockSummaryConfig(base: BlockSummaryConfig | null, override: unknown): BlockSummaryConfig | null;
export declare function computeBlockSummaryStats(args: {
    trialResults: unknown[];
    where?: BlockSummaryWhere;
    metrics: BlockSummaryMetrics;
}): {
    total: number;
    correct: number;
    accuracyPct: number;
    meanRtMs: number;
    validRtCount: number;
};
export declare function buildBlockSummaryModel(args: {
    config: BlockSummaryConfig | null;
    block: unknown;
    blockIndex: number;
    trialResults?: unknown[];
    fallbackStats?: BlockSummaryStats;
}): BlockSummaryModel | null;
export declare function renderBlockSummaryCardHtml(model: BlockSummaryModel): string;
