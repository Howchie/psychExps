import { SeededRandom } from "./random";
const defaultRng = {
    next: () => Math.random(),
    nextFloat: () => Math.random(),
    nextRange: (min, max) => min + (max - min) * Math.random(),
    nextNormal: (mu = 0, sigma = 1) => {
        let u1 = 0;
        while (u1 === 0)
            u1 = Math.random();
        const u2 = Math.random();
        const mag = Math.sqrt(-2 * Math.log(u1));
        return mu + sigma * mag * Math.cos(2 * Math.PI * u2);
    },
};
const LIST_WEIGHT_SUM_TOLERANCE = 1e-6;
export const SAMPLER_TYPES = Object.freeze([
    "fixed",
    "uniform",
    "normal",
    "truncnorm",
    "exponential",
    "poisson",
    "negative_binomial",
    "negbin",
    "list",
]);
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isCreateSamplerOptions = (value) => isObject(value) && (Object.prototype.hasOwnProperty.call(value, "rng") || Object.prototype.hasOwnProperty.call(value, "backend"));
const toSamplerRng = (rng) => rng ?? defaultRng;
const nextFloat = (rng) => {
    if (typeof rng.nextFloat === "function")
        return rng.nextFloat();
    const raw = rng.next();
    const normalized = raw >= 1 ? raw / 0x100000000 : raw;
    if (!Number.isFinite(normalized))
        return Math.random();
    return Math.min(0.999999999999, Math.max(0, normalized));
};
const nextRange = (rng, min, max) => {
    if (typeof rng.nextRange === "function")
        return rng.nextRange(min, max);
    return min + (max - min) * nextFloat(rng);
};
const nextNormal = (rng, mu = 0, sigma = 1) => {
    if (typeof rng.nextNormal === "function")
        return rng.nextNormal(mu, sigma);
    let u1 = 0;
    while (u1 === 0)
        u1 = nextFloat(rng);
    const u2 = nextFloat(rng);
    const mag = Math.sqrt(-2 * Math.log(u1));
    return mu + sigma * mag * Math.cos(2 * Math.PI * u2);
};
const clamp = (value, min, max) => {
    let result = value;
    if (typeof min === "number")
        result = Math.max(min, result);
    if (typeof max === "number")
        result = Math.min(max, result);
    return result;
};
const samplePoissonWithLambda = (lambda, rng, backend) => {
    if (backend?.poisson)
        return backend.poisson(lambda, rng);
    if (lambda <= 50) {
        const l = Math.exp(-lambda);
        let k = 0;
        let p = 1;
        do {
            k += 1;
            p *= nextFloat(rng);
        } while (p > l);
        return k - 1;
    }
    return Math.max(0, Math.round(nextNormal(rng, lambda, Math.sqrt(lambda))));
};
const sampleGamma = (shape, scale, rng) => {
    if (!(shape > 0) || !(scale > 0)) {
        throw new Error(`Gamma params must be > 0 (shape=${shape}, scale=${scale})`);
    }
    if (shape < 1) {
        const u = nextFloat(rng);
        return sampleGamma(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        const z = nextNormal(rng, 0, 1);
        const v = 1 + c * z;
        if (v <= 0)
            continue;
        const v3 = v * v * v;
        const u = nextFloat(rng);
        if (u < 1 - 0.0331 * z * z * z * z) {
            return scale * d * v3;
        }
        if (Math.log(u) < 0.5 * z * z + d * (1 - v3 + Math.log(v3))) {
            return scale * d * v3;
        }
    }
};
const pickWeightedIndex = (weights, rng) => {
    const total = weights.reduce((acc, value) => acc + value, 0);
    if (!(total > 0)) {
        return Math.floor(nextRange(rng, 0, weights.length));
    }
    let threshold = nextRange(rng, 0, total);
    for (let i = 0; i < weights.length; i += 1) {
        threshold -= weights[i];
        if (threshold <= 0 || i === weights.length - 1)
            return i;
    }
    return weights.length - 1;
};
const shuffleInPlace = (items, rng) => {
    for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextRange(rng, 0, i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
};
const parseListWeights = (weightsSpec, itemCount) => {
    if (weightsSpec == null)
        return null;
    if (!Array.isArray(weightsSpec)) {
        throw new Error('List sampler "weights" must be an array when provided.');
    }
    if (weightsSpec.length !== itemCount) {
        throw new Error(`List sampler "weights" length (${weightsSpec.length}) must match "values" length (${itemCount}).`);
    }
    const weights = weightsSpec.map((value, index) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
            throw new Error(`List sampler "weights"[${index}] must be a finite number >= 0.`);
        }
        return numeric;
    });
    const sum = weights.reduce((acc, value) => acc + value, 0);
    if (sum <= 0) {
        throw new Error('List sampler "weights" must include at least one value > 0.');
    }
    if (Math.abs(sum - 1) > LIST_WEIGHT_SUM_TOLERANCE) {
        throw new Error(`List sampler "weights" must be normalized to sum to 1 (received ${sum}).`);
    }
    return weights;
};
const normalizeSamplerSpec = (spec) => {
    if (Array.isArray(spec)) {
        return { type: "list", values: spec };
    }
    if (!isObject(spec)) {
        return { type: "fixed", value: spec };
    }
    return spec;
};
function drawNormal(mu, sd, rng, backend) {
    return backend?.normal ? backend.normal(mu, sd, rng) : nextNormal(rng, mu, sd);
}
function createDefaultSeededRng(seed = 1) {
    const random = new SeededRandom(seed >>> 0);
    return {
        next: () => random.next(),
    };
}
export function createSampler(spec, optionsOrRng, backendArg) {
    const options = isCreateSamplerOptions(optionsOrRng)
        ? optionsOrRng
        : { rng: optionsOrRng, backend: backendArg };
    const rng = toSamplerRng(options.rng ?? createDefaultSeededRng(1));
    const backend = options.backend;
    const normalizedSpec = normalizeSamplerSpec(spec);
    const type = String(normalizedSpec.type ?? "fixed").trim().toLowerCase();
    switch (type) {
        case "fixed": {
            const value = normalizedSpec.value;
            return () => value;
        }
        case "uniform": {
            const min = Number(normalizedSpec.min);
            const max = Number(normalizedSpec.max);
            if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
                throw new Error(`Invalid uniform sampler bounds: ${min}, ${max}`);
            }
            return () => (backend?.uniform ? backend.uniform(min, max, rng) : nextRange(rng, min, max));
        }
        case "normal": {
            const mu = Number(normalizedSpec.mu);
            const sd = Number(normalizedSpec.sd);
            if (!Number.isFinite(mu) || !Number.isFinite(sd) || sd <= 0) {
                throw new Error(`Invalid normal sampler parameters: ${mu}, ${sd}`);
            }
            const min = Number.isFinite(normalizedSpec.min) ? Number(normalizedSpec.min) : undefined;
            const max = Number.isFinite(normalizedSpec.max) ? Number(normalizedSpec.max) : undefined;
            return () => clamp(drawNormal(mu, sd, rng, backend), min, max);
        }
        case "truncnorm": {
            const mu = Number(normalizedSpec.mu);
            const sd = Number(normalizedSpec.sd);
            if (!Number.isFinite(mu) || !Number.isFinite(sd) || sd <= 0) {
                throw new Error(`Invalid truncnorm sampler parameters: ${mu}, ${sd}`);
            }
            const specMin = Number.isFinite(normalizedSpec.min) ? Number(normalizedSpec.min) : undefined;
            const min = Math.max(0, specMin ?? 0);
            const max = Number.isFinite(normalizedSpec.max) ? Number(normalizedSpec.max) : undefined;
            if (typeof max === "number" && max < min) {
                throw new Error(`Invalid truncnorm bounds: min=${min}, max=${max}`);
            }
            return () => {
                if (backend?.truncnorm) {
                    return backend.truncnorm({ mu, sd, min, max }, rng);
                }
                for (let i = 0; i < 1024; i += 1) {
                    const sample = drawNormal(mu, sd, rng, backend);
                    if (sample >= min && (typeof max !== "number" || sample <= max)) {
                        return sample;
                    }
                }
                return clamp(Math.max(min, mu), min, max);
            };
        }
        case "exponential": {
            const lambda = Number(normalizedSpec.lambda);
            if (!Number.isFinite(lambda) || lambda <= 0) {
                throw new Error(`Invalid exponential lambda: ${lambda}`);
            }
            const min = Number.isFinite(normalizedSpec.min) ? Number(normalizedSpec.min) : undefined;
            const max = Number.isFinite(normalizedSpec.max) ? Number(normalizedSpec.max) : undefined;
            return () => {
                const sample = backend?.exponential
                    ? backend.exponential(lambda, rng)
                    : (() => {
                        let u = 0;
                        while (u === 0)
                            u = nextFloat(rng);
                        return -Math.log(1 - u) / lambda;
                    })();
                return clamp(sample, min, max);
            };
        }
        case "poisson": {
            const lambda = Number(normalizedSpec.lambda);
            if (!Number.isFinite(lambda) || lambda <= 0) {
                throw new Error(`Invalid poisson lambda: ${lambda}`);
            }
            const specMin = Number.isFinite(normalizedSpec.min) ? Number(normalizedSpec.min) : undefined;
            const min = Math.max(0, typeof specMin === "number" ? Math.ceil(specMin) : 0);
            const max = Number.isFinite(normalizedSpec.max) ? Math.floor(Number(normalizedSpec.max)) : undefined;
            if (typeof max === "number" && max < min) {
                throw new Error(`Invalid poisson bounds: min=${min}, max=${max}`);
            }
            return () => clamp(samplePoissonWithLambda(lambda, rng, backend), min, max);
        }
        case "negative_binomial":
        case "negbin": {
            const mu = Number(normalizedSpec.mu);
            const kRaw = normalizedSpec.k ?? normalizedSpec.size ?? normalizedSpec.dispersion ?? normalizedSpec.r;
            const k = Number(kRaw);
            if (!Number.isFinite(mu) || mu < 0) {
                throw new Error(`Invalid negative binomial mu: ${mu}`);
            }
            if (!Number.isFinite(k) || k <= 0) {
                throw new Error(`Invalid negative binomial dispersion k/size: ${String(kRaw)}`);
            }
            const specMin = Number.isFinite(normalizedSpec.min) ? Number(normalizedSpec.min) : undefined;
            const min = Math.max(0, typeof specMin === "number" ? Math.ceil(specMin) : 0);
            const max = Number.isFinite(normalizedSpec.max) ? Math.floor(Number(normalizedSpec.max)) : undefined;
            if (typeof max === "number" && max < min) {
                throw new Error(`Invalid negative binomial bounds: min=${min}, max=${max}`);
            }
            if (mu === 0) {
                return () => clamp(0, min, max);
            }
            return () => {
                const sample = backend?.negativeBinomial
                    ? backend.negativeBinomial({ mu, k }, rng)
                    : (() => {
                        const lambda = sampleGamma(k, mu / k, rng);
                        return samplePoissonWithLambda(lambda, rng, backend);
                    })();
                return clamp(sample, min, max);
            };
        }
        case "list": {
            const valuesRaw = normalizedSpec.values ?? normalizedSpec.items ?? normalizedSpec.options;
            const items = Array.isArray(valuesRaw) ? valuesRaw.slice() : [];
            if (items.length === 0) {
                throw new Error('List sampler requires a non-empty "values" array.');
            }
            const weights = parseListWeights(normalizedSpec.weights, items.length);
            const drawModeRaw = normalizedSpec.draw ?? normalizedSpec.mode;
            const drawMode = (typeof drawModeRaw === "string" ? drawModeRaw : "").trim().toLowerCase();
            const withoutReplacement = normalizedSpec.without_replacement === true ||
                normalizedSpec.withoutReplacement === true ||
                drawMode === "without_replacement";
            const shufflePool = normalizedSpec.shuffle !== false;
            if (!withoutReplacement) {
                if (!weights) {
                    return () => items[Math.floor(nextRange(rng, 0, items.length))];
                }
                return () => {
                    const index = pickWeightedIndex(weights, rng);
                    return items[index];
                };
            }
            let pool = items.slice();
            let cursor = 0;
            const reshuffle = () => {
                if (weights) {
                    const remainingItems = items.slice();
                    const remainingWeights = weights.slice();
                    pool = [];
                    while (remainingItems.length > 0) {
                        const total = remainingWeights.reduce((acc, value) => acc + value, 0);
                        let pickIndex = 0;
                        if (total > 0) {
                            let threshold = nextRange(rng, 0, total);
                            for (let i = 0; i < remainingWeights.length; i += 1) {
                                threshold -= remainingWeights[i];
                                if (threshold <= 0 || i === remainingWeights.length - 1) {
                                    pickIndex = i;
                                    break;
                                }
                            }
                        }
                        else {
                            pickIndex = Math.floor(nextRange(rng, 0, remainingItems.length));
                        }
                        pool.push(remainingItems[pickIndex]);
                        remainingItems.splice(pickIndex, 1);
                        remainingWeights.splice(pickIndex, 1);
                    }
                }
                else {
                    pool = items.slice();
                    if (shufflePool) {
                        shuffleInPlace(pool, rng);
                    }
                }
                cursor = 0;
            };
            reshuffle();
            return () => {
                if (cursor >= pool.length) {
                    reshuffle();
                }
                const value = pool[cursor];
                cursor += 1;
                return value;
            };
        }
        default:
            throw new Error(`Unknown sampler type: ${type}`);
    }
}
export function sampleValue(spec, optionsOrRng, backendArg) {
    if (isCreateSamplerOptions(optionsOrRng)) {
        return createSampler(spec, optionsOrRng)();
    }
    return createSampler(spec, optionsOrRng, backendArg)();
}
//# sourceMappingURL=sampling.js.map