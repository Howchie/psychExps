import { SeededRandom, hashSeed } from "../infrastructure/random";
import { createSampler } from "../infrastructure/sampling";
export function resolveWithVariables(value, resolver, context) {
    return resolver ? resolver.resolveInValue(value, context) : value;
}
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const SAMPLER_KEYS = new Set([
    "type",
    "values",
    "items",
    "options",
    "weights",
    "without_replacement",
    "withoutReplacement",
    "draw",
    "mode",
    "min",
    "max",
    "mu",
    "sd",
    "lambda",
    "k",
    "size",
    "dispersion",
    "r",
]);
const SAMPLE_TOKEN_RE = /^\$sample\.([A-Za-z0-9_.-]+)(?::(\d+))?$/;
const VAR_TOKEN_RE = /^\$var\.([A-Za-z0-9_.-]+)$/;
const NAMESPACE_TOKEN_RE = /^\$([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/;
function hasSamplerShape(value) {
    return Object.keys(value).some((key) => SAMPLER_KEYS.has(key));
}
function normalizeScope(scopeValue) {
    const raw = String(scopeValue ?? "participant").trim().toLowerCase();
    if (raw === "trial")
        return "trial";
    if (raw === "block")
        return "block";
    return "participant";
}
function normalizeVariableDefinition(name, raw) {
    if (isObject(raw)) {
        const scope = normalizeScope(raw.scope);
        if (Object.prototype.hasOwnProperty.call(raw, "sampler")) {
            const countRaw = Number(raw.count ?? raw.draws ?? raw.n ?? 1);
            const count = Number.isFinite(countRaw) && countRaw > 1 ? Math.floor(countRaw) : 1;
            return {
                name,
                scope,
                mode: "sampler",
                samplerSpec: raw.sampler,
                count,
            };
        }
        if (Object.prototype.hasOwnProperty.call(raw, "value")) {
            return {
                name,
                scope,
                mode: "value",
                value: raw.value,
            };
        }
        if (hasSamplerShape(raw)) {
            return {
                name,
                scope,
                mode: "sampler",
                samplerSpec: raw,
                count: 1,
            };
        }
    }
    if (Array.isArray(raw)) {
        return {
            name,
            scope: "participant",
            mode: "sampler",
            samplerSpec: raw,
            count: 1,
        };
    }
    // If it's a string, it's a direct value (potentially a variable token like $var.foo)
    // We do NOT treat it as a sampler even if it looks like a list sampler might be intended later.
    return {
        name,
        scope: "participant",
        mode: "value",
        value: raw,
    };
}
function makeDefaultRng(seedParts) {
    const seed = hashSeed(...seedParts);
    const random = new SeededRandom(seed);
    return {
        next: () => random.next(),
    };
}
function getScopeInstanceId(scope, context) {
    if (scope === "block") {
        return Number.isFinite(context?.blockIndex) ? `block:${context?.blockIndex}` : "block:default";
    }
    if (scope === "trial") {
        const blockPart = Number.isFinite(context?.blockIndex) ? String(context?.blockIndex) : "default";
        const trialPart = Number.isFinite(context?.trialIndex) ? String(context?.trialIndex) : "default";
        return `trial:${blockPart}:${trialPart}`;
    }
    return "participant";
}
function deepGet(source, path) {
    if (!path)
        return source;
    const segments = path.split(".").filter(Boolean);
    let cursor = source;
    for (const segment of segments) {
        if (!isObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
            return undefined;
        }
        cursor = cursor[segment];
    }
    return cursor;
}
export function createVariableResolver(args = {}) {
    const variableDefsRaw = args.variables ?? {};
    const variables = isObject(variableDefsRaw) ? variableDefsRaw : {};
    const rng = args.rng ?? makeDefaultRng(args.seedParts ?? ["variables"]);
    const backend = args.samplerBackend;
    const allowedScopes = args.allowedScopes ? new Set(args.allowedScopes) : null;
    const normalizedDefs = new Map();
    for (const [name, raw] of Object.entries(variables)) {
        normalizedDefs.set(name, normalizeVariableDefinition(name, raw));
    }
    const namespaces = new Map();
    if (args.namespaces) {
        for (const [name, values] of Object.entries(args.namespaces)) {
            namespaces.set(name, { ...values });
        }
    }
    const valueCache = new Map();
    const samplerCache = new Map();
    const getDef = (name) => normalizedDefs.get(name) ?? null;
    const getSampler = (def, context) => {
        const instanceId = getScopeInstanceId(def.scope, context);
        const key = `${def.name}|${instanceId}`;
        const existing = samplerCache.get(key);
        if (existing)
            return existing;
        const sampler = createSampler(def.samplerSpec, { rng, backend });
        samplerCache.set(key, sampler);
        return sampler;
    };
    const resolveVarInternal = (name, context, stack) => {
        if (context?.locals && Object.prototype.hasOwnProperty.call(context.locals, name)) {
            const rawLocal = context.locals[name];
            if (stack.has(name))
                return rawLocal;
            stack.add(name);
            const resolved = resolveInValueInternal(rawLocal, context, stack);
            stack.delete(name);
            return resolved;
        }
        const def = getDef(name);
        if (!def)
            return undefined;
        if (allowedScopes && !allowedScopes.has(def.scope)) {
            return undefined;
        }
        if (def.mode === "value") {
            if (stack.has(name))
                return def.value;
            stack.add(name);
            const resolved = resolveInValueInternal(def.value, context, stack);
            stack.delete(name);
            return resolved;
        }
        const instanceId = getScopeInstanceId(def.scope, context);
        const key = `${def.name}|${instanceId}|value`;
        if (valueCache.has(key))
            return valueCache.get(key);
        const count = Math.max(1, Math.floor(Number(def.count ?? 1)));
        const rawValue = count > 1
            ? Array.from({ length: count }, () => getSampler(def, context)())
            : getSampler(def, context)();
        const value = resolveInValueInternal(rawValue, context, stack);
        valueCache.set(key, value);
        return value;
    };
    const sampleVar = (name, count = 1, context) => {
        const n = Math.max(1, Math.floor(Number(count) || 1));
        const def = getDef(name);
        if (!def)
            return [];
        if (allowedScopes && !allowedScopes.has(def.scope))
            return [];
        if (def.mode === "value")
            return Array.from({ length: n }, () => def.value);
        const sampler = getSampler(def, context);
        return Array.from({ length: n }, () => sampler());
    };
    const resolveNamespace = (namespace, path, context, stack) => {
        if ((namespace === "local" || namespace === "locals") && context?.locals) {
            const nestedLocal = deepGet(context.locals, path);
            if (typeof nestedLocal !== "undefined")
                return nestedLocal;
        }
        const nsValues = namespaces.get(namespace);
        if (nsValues) {
            const nested = deepGet(nsValues, path);
            if (typeof nested !== "undefined")
                return nested;
        }
        const baseVariable = resolveVarInternal(namespace, context, stack);
        if (typeof baseVariable !== "undefined") {
            const nested = deepGet(baseVariable, path);
            if (typeof nested !== "undefined")
                return nested;
        }
        const directVariable = `${namespace}.${path}`;
        const fromVariable = resolveVarInternal(directVariable, context, stack);
        if (typeof fromVariable !== "undefined")
            return fromVariable;
        return undefined;
    };
    const resolveTokenInternal = (token, context, stack) => {
        if (typeof token !== "string")
            return token;
        const text = token.trim();
        const sampleMatch = text.match(SAMPLE_TOKEN_RE);
        if (sampleMatch) {
            const name = sampleMatch[1];
            const def = getDef(name);
            if (def && allowedScopes && !allowedScopes.has(def.scope)) {
                return token;
            }
            const count = Number(sampleMatch[2] ?? "1");
            const sampled = sampleVar(name, count, context);
            return sampled.length === 1 && !sampleMatch[2] ? sampled[0] : sampled;
        }
        const varMatch = text.match(VAR_TOKEN_RE);
        if (varMatch) {
            const name = varMatch[1];
            const direct = resolveVarInternal(name, context, stack);
            if (typeof direct !== "undefined")
                return direct;
            const dot = name.indexOf(".");
            if (dot > 0) {
                const base = name.slice(0, dot);
                const path = name.slice(dot + 1);
                const baseValue = resolveVarInternal(base, context, stack);
                const nested = deepGet(baseValue, path);
                if (typeof nested !== "undefined")
                    return nested;
            }
            return token;
        }
        const namespaceMatch = text.match(NAMESPACE_TOKEN_RE);
        if (namespaceMatch) {
            const namespace = namespaceMatch[1];
            const path = namespaceMatch[2];
            // Special case: if it's $var.foo, we already handled it above.
            if (namespace !== "var" && namespace !== "sample") {
                const resolved = resolveNamespace(namespace, path, context, stack);
                if (typeof resolved !== "undefined")
                    return resolved;
                // Fallback: maybe the namespace is actually a variable name?
                const baseValue = resolveVarInternal(namespace, context, stack);
                if (typeof baseValue !== "undefined") {
                    const nested = deepGet(baseValue, path);
                    if (typeof nested !== "undefined")
                        return nested;
                }
            }
        }
        return token;
    };
    const resolveInValueInternal = (value, context, stack) => {
        if (Array.isArray(value)) {
            return value.flatMap((entry) => {
                const resolved = resolveInValueInternal(entry, context, stack);
                return Array.isArray(resolved) ? resolved : [resolved];
            });
        }
        if (isObject(value)) {
            const out = {};
            for (const [key, entry] of Object.entries(value)) {
                out[key] = resolveInValueInternal(entry, context, stack);
            }
            return out;
        }
        if (typeof value === "string") {
            return resolveTokenInternal(value, context, stack);
        }
        return value;
    };
    const resolveVar = (name, context) => resolveVarInternal(name, context, new Set());
    const resolveToken = (token, context) => resolveTokenInternal(token, context, new Set());
    const resolveInValue = (value, context) => resolveInValueInternal(value, context, new Set());
    return {
        resolveToken,
        resolveInValue,
        resolveVar,
        sampleVar,
        setNamespace(name, values) {
            namespaces.set(name, { ...values });
        },
        getNamespace(name) {
            return namespaces.get(name);
        },
    };
}
//# sourceMappingURL=variables.js.map