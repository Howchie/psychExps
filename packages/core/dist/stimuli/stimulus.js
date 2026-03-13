import { resolveRuntimePath } from "../infrastructure/runtimePaths";
const PLACEHOLDER_RE = /\{([^{}]+)\}/g;
const ABSOLUTE_URL_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const deepGet = (source, path) => {
    if (!path)
        return source;
    const parts = path.split(".").filter(Boolean);
    let cursor = source;
    for (const part of parts) {
        if (!isObject(cursor) || !Object.prototype.hasOwnProperty.call(cursor, part)) {
            return undefined;
        }
        cursor = cursor[part];
    }
    return cursor;
};
const toStringOrEmpty = (value) => {
    if (value == null)
        return "";
    return String(value);
};
function resolvePlaceholderValue(key, args) {
    const { vars, resolver, context } = args;
    if (key === "runtime.assetsBase")
        return resolveRuntimePath("/assets");
    if (key === "runtime.configsBase")
        return resolveRuntimePath("/configs");
    const fromVars = deepGet(vars, key);
    if (typeof fromVars !== "undefined")
        return fromVars;
    if (resolver) {
        const fromVar = resolver.resolveVar(key, context);
        if (typeof fromVar !== "undefined")
            return fromVar;
        const fromNamespace = resolver.resolveToken(`$${key}`, context);
        if (typeof fromNamespace !== "undefined" && fromNamespace !== `$${key}`)
            return fromNamespace;
    }
    return "";
}
export function resolveTemplatedString(args) {
    const interpolated = String(args.template).replace(PLACEHOLDER_RE, (_, rawKey) => {
        const key = rawKey.trim();
        const value = resolvePlaceholderValue(key, args);
        return toStringOrEmpty(value);
    });
    if (!args.resolver)
        return interpolated;
    const tokenResolved = args.resolver.resolveToken(interpolated, args.context);
    return typeof tokenResolved === "string" ? tokenResolved : interpolated;
}
export function resolveAssetPath(args) {
    const rawTemplate = String(args.template ?? "");
    const renderedTemplate = resolveTemplatedString(args);
    if (renderedTemplate.startsWith("http://") || renderedTemplate.startsWith("https://"))
        return renderedTemplate;
    const templateHasLeadingSlash = rawTemplate.startsWith("/");
    const rendered = renderedTemplate.replace(/^\/+/, "");
    const rawBase = resolveTemplatedString({
        template: String(args.basePath ?? ""),
        vars: args.vars,
        resolver: args.resolver,
        context: args.context,
    }).replace(/\/+$/, "");
    if (!rawBase) {
        return resolveRuntimePath(templateHasLeadingSlash ? `/${rendered}` : rendered);
    }
    if (templateHasLeadingSlash) {
        // Absolute template paths intentionally bypass any basePath.
        return resolveRuntimePath(`/${rendered}`);
    }
    if (ABSOLUTE_URL_RE.test(rawBase)) {
        return `${rawBase}/${rendered}`;
    }
    const baseHasLeadingSlash = rawBase.startsWith("/");
    const joined = `${rawBase.replace(/^\/+/, "")}/${rendered}`;
    return resolveRuntimePath(baseHasLeadingSlash ? `/${joined}` : joined);
}
export function splitCsvLine(line) {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === "\"") {
            const next = line[i + 1];
            if (inQuotes && next === "\"") {
                current += "\"";
                i += 1;
            }
            else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (ch === "," && !inQuotes) {
            out.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    out.push(current);
    return out;
}
export function parseCsvColumn(csvText, columnName) {
    const lines = csvText
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (lines.length === 0)
        return [];
    const header = splitCsvLine(lines[0]);
    const columnIndex = header.findIndex((name) => name.trim().toLowerCase() === columnName.trim().toLowerCase());
    if (columnIndex < 0)
        return [];
    const values = [];
    for (let i = 1; i < lines.length; i += 1) {
        const cols = splitCsvLine(lines[i]);
        const raw = cols[columnIndex] ?? "";
        const value = raw.trim();
        if (!value)
            continue;
        values.push(value);
    }
    return values;
}
export async function fetchTextNoStore(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok)
        throw new Error(`Failed to load CSV: ${url} (HTTP ${response.status})`);
    return response.text();
}
export async function loadStimuliPoolsFromCsv(config, resolver, context) {
    const output = {};
    const categories = config.categories ?? {};
    const defaultIdColumn = String(config.defaultIdColumn ?? "file");
    for (const [category, rawSpec] of Object.entries(categories)) {
        const spec = typeof rawSpec === "string" ? { path: rawSpec } : rawSpec;
        const column = resolveTemplatedString({
            template: String(spec.column ?? spec.idColumn ?? defaultIdColumn),
            vars: { category },
            resolver,
            context,
        });
        const url = resolveAssetPath({
            basePath: config.basePath,
            template: spec.path,
            vars: { category, column },
            resolver,
            context,
        });
        const text = await fetchTextNoStore(url);
        output[category] = parseCsvColumn(text, column);
    }
    return output;
}
export function isLikelyImageStimulus(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text)
        return false;
    if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("data:image/"))
        return true;
    return /(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.bmp|\.svg)$/i.test(text);
}
const SHARED_IMAGE_CACHE = new Map();
export async function loadImageIfLikelyVisualStimulus(value, cache = SHARED_IMAGE_CACHE) {
    if (!isLikelyImageStimulus(value))
        return null;
    if (!cache.has(value)) {
        cache.set(value, new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = value;
        }));
    }
    return cache.get(value) ?? null;
}
//# sourceMappingURL=stimulus.js.map