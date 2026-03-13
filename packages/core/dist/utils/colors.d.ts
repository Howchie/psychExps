export interface ColorRegistryOptions {
    normalizeToken?: (token: string) => string;
    fallbackColor?: string | null;
}
export interface ColorRegistry {
    resolve(token: string | null | undefined): string | null;
    has(token: string): boolean;
    token(token: string): string;
    entries(): Array<{
        token: string;
        color: string;
    }>;
}
export declare function isLikelyCssColor(value: string): boolean;
export declare function normalizeColorToken(token: string, normalize?: (token: string) => string): string;
export declare function createColorRegistry(tokenToColor: Record<string, string>, options?: ColorRegistryOptions): ColorRegistry;
export declare function resolveColorToken(tokenToColor: Record<string, string>, token: string | null | undefined, options?: ColorRegistryOptions): string | null;
