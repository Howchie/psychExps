export interface SamplerRng {
    next: () => number;
    nextFloat?: () => number;
    nextRange?: (min: number, max: number) => number;
    nextNormal?: (mu?: number, sigma?: number) => number;
}
export type SamplerType = "fixed" | "uniform" | "normal" | "truncnorm" | "exponential" | "poisson" | "negative_binomial" | "negbin" | "list";
export interface SamplerSpecObject {
    type?: SamplerType | string;
    [key: string]: unknown;
}
export type SamplerSpec = unknown;
export interface SamplerBackend {
    uniform?: (min: number, max: number, rng: SamplerRng) => number;
    normal?: (mu: number, sd: number, rng: SamplerRng) => number;
    truncnorm?: (args: {
        mu: number;
        sd: number;
        min?: number;
        max?: number;
    }, rng: SamplerRng) => number;
    exponential?: (lambda: number, rng: SamplerRng) => number;
    poisson?: (lambda: number, rng: SamplerRng) => number;
    negativeBinomial?: (args: {
        mu: number;
        k: number;
    }, rng: SamplerRng) => number;
}
export interface CreateSamplerOptions {
    rng?: SamplerRng;
    backend?: SamplerBackend;
}
export declare const SAMPLER_TYPES: readonly SamplerType[];
export declare function createSampler(spec: SamplerSpec, options?: CreateSamplerOptions): () => unknown;
export declare function createSampler(spec: SamplerSpec, rng?: SamplerRng, backend?: SamplerBackend): () => unknown;
export declare function sampleValue(spec: SamplerSpec, options?: CreateSamplerOptions): unknown;
export declare function sampleValue(spec: SamplerSpec, rng?: SamplerRng, backend?: SamplerBackend): unknown;
