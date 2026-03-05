import { type SamplerBackend, type SamplerRng } from "../infrastructure/sampling";
export type VariableScope = "participant" | "block" | "trial";
export interface VariableDefinition {
    scope?: VariableScope;
    value?: unknown;
    sampler?: unknown;
    count?: number;
}
export interface VariableResolverContext {
    blockIndex?: number;
    trialIndex?: number;
    locals?: Record<string, unknown>;
}
export interface CreateVariableResolverArgs {
    variables?: Record<string, unknown> | null;
    rng?: SamplerRng;
    seedParts?: string[];
    samplerBackend?: SamplerBackend;
    namespaces?: Record<string, Record<string, unknown>>;
}
export interface VariableResolver {
    resolveToken(token: unknown, context?: VariableResolverContext): unknown;
    resolveInValue<T>(value: T, context?: VariableResolverContext): T;
    resolveVar(name: string, context?: VariableResolverContext): unknown;
    sampleVar(name: string, count?: number, context?: VariableResolverContext): unknown[];
    setNamespace(name: string, values: Record<string, unknown>): void;
    getNamespace(name: string): Record<string, unknown> | undefined;
}
export declare function resolveWithVariables<T>(value: T, resolver?: VariableResolver | null, context?: VariableResolverContext): T;
export declare function createVariableResolver(args?: CreateVariableResolverArgs): VariableResolver;
