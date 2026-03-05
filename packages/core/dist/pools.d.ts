import { type CsvStimulusConfig } from "./stimulus";
import type { VariableResolver, VariableResolverContext } from "./variables";
export type PoolDrawMode = "ordered" | "with_replacement" | "without_replacement";
export type CategoryDrawMode = PoolDrawMode | "round_robin";
export interface PoolDrawConfig {
    mode: PoolDrawMode;
    shuffle: boolean;
}
export interface CategoryDrawConfig {
    mode: CategoryDrawMode;
    shuffle: boolean;
}
export interface PoolCandidate {
    item: string;
    category: string;
}
export interface PoolRng {
    next: () => number;
    shuffle: <T>(items: T[]) => T[];
    int?: (min: number, max: number) => number;
}
export interface CategorizedPoolLoadArgs {
    inlinePools: Record<string, string[]>;
    csvConfig?: CsvStimulusConfig | null;
    resolver?: VariableResolver;
    context?: VariableResolverContext;
}
export interface CategoryPoolDrawerOptions {
    itemDraw?: Partial<PoolDrawConfig> | null;
    categoryDraw?: Partial<CategoryDrawConfig> | null;
}
export interface TokenPoolCsvSpec {
    path: string;
    column?: string;
    basePath?: string;
}
export interface TokenPoolSourceArgs {
    inline?: unknown;
    csv?: TokenPoolCsvSpec | null;
    normalize?: "none" | "lowercase";
    dedupe?: boolean;
}
export declare function coercePoolDrawConfig(value: unknown, defaults?: PoolDrawConfig): PoolDrawConfig;
export declare function coerceCategoryDrawConfig(value: unknown, defaults?: CategoryDrawConfig): CategoryDrawConfig;
export declare function collectPoolCandidates(pools: Record<string, string[]>, categories: string[], excludedCategories?: Set<string>): PoolCandidate[];
export declare function createPoolDrawer(candidates: PoolCandidate[], rng: PoolRng, drawConfig?: Partial<PoolDrawConfig> | null): () => PoolCandidate;
export declare function createCategoryPoolDrawer(pools: Record<string, string[]>, categories: string[], rng: PoolRng, options?: CategoryPoolDrawerOptions): () => PoolCandidate;
export declare function coerceCsvStimulusConfig(value: unknown): CsvStimulusConfig | null;
export declare function loadCategorizedStimulusPools(args: CategorizedPoolLoadArgs): Promise<Record<string, string[]>>;
export declare function loadTokenPool(args: TokenPoolSourceArgs): Promise<string[]>;
