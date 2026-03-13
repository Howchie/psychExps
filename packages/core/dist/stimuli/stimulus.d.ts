import type { VariableResolver, VariableResolverContext } from "../infrastructure/variables";
export interface CsvSourceSpec {
    path: string;
    column?: string;
    idColumn?: string;
}
export interface CsvStimulusConfig {
    basePath?: string;
    defaultIdColumn?: string;
    categories: Record<string, string | CsvSourceSpec>;
}
export interface TemplateResolveArgs {
    template: string;
    vars?: Record<string, unknown>;
    resolver?: VariableResolver;
    context?: VariableResolverContext;
}
export interface ResolveAssetPathArgs extends TemplateResolveArgs {
    basePath?: string;
}
export declare function resolveTemplatedString(args: TemplateResolveArgs): string;
export declare function resolveAssetPath(args: ResolveAssetPathArgs): string;
export declare function splitCsvLine(line: string): string[];
export declare function parseCsvColumn(csvText: string, columnName: string): string[];
export declare function fetchTextNoStore(url: string): Promise<string>;
export declare function loadStimuliPoolsFromCsv(config: CsvStimulusConfig, resolver?: VariableResolver, context?: VariableResolverContext): Promise<Record<string, string[]>>;
export declare function isLikelyImageStimulus(value: string): boolean;
export declare function loadImageIfLikelyVisualStimulus(value: string, cache?: Map<string, Promise<HTMLImageElement | null>>): Promise<HTMLImageElement | null>;
