import { type TemplateResolveArgs } from "../web/stimulus";
export interface CsvDictionarySpec {
    path: string;
    keyColumn: string;
    valueColumn: string;
    basePath?: string;
    resolverArgs?: Omit<TemplateResolveArgs, "template">;
}
export interface SemanticIndexOptions {
    normalize?: (value: string) => string;
    onConflict?: "first_wins" | "last_wins" | "error";
}
export interface SemanticResolver {
    resolve(term: string): string | null;
    has(term: string): boolean;
}
export declare function parseCsvDictionary(csvText: string, keyColumn: string, valueColumn: string, options?: SemanticIndexOptions): Map<string, string>;
export declare function loadCsvDictionary(spec: CsvDictionarySpec): Promise<Map<string, string>>;
export declare function buildSemanticIndex(labelsToTerms: Record<string, string[]>, options?: SemanticIndexOptions): Map<string, string>;
export declare function createSemanticResolver(indexLike: Map<string, string> | Record<string, string>, options?: Pick<SemanticIndexOptions, "normalize">): SemanticResolver;
export declare function loadSemanticIndexFromCsvColumns(csvPath: string, keyColumn: string, labelColumns: Record<string, string>, args?: Omit<CsvDictionarySpec, "path" | "keyColumn" | "valueColumn">): Promise<Map<string, string>>;
export declare function loadTokenListFromCsvColumn(path: string, column: string, args?: Omit<CsvDictionarySpec, "path" | "keyColumn" | "valueColumn">): Promise<string[]>;
