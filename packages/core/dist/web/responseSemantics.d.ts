export interface ResponseSemanticsOptions {
    timeoutCategory?: string;
    invalidCategory?: string;
    duplicateKeyPolicy?: "error" | "first_wins" | "last_wins";
}
export interface ResponseSemantics {
    categories(): string[];
    categoriesWithMeta(): string[];
    allowedKeys(categories?: string[]): string[];
    responseCategoryFromKey(key: string | null | undefined): string;
    expectedCategoryFromKey(key: string | null | undefined, fallbackCategory?: string): string;
    expectedCategoryFromSpec(spec: string | null | undefined, fallbackCategory?: string): string;
    keyForCategory(category: string): string | null;
    hasCategory(category: string): boolean;
    hasResponseCategory(category: string): boolean;
}
type CategoryKeyMap = Record<string, string | string[]>;
export declare function createResponseSemantics(categoryToKeys: CategoryKeyMap, options?: ResponseSemanticsOptions): ResponseSemantics;
export {};
