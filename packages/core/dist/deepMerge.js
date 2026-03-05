const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const clone = (value) => {
    if (Array.isArray(value)) {
        return value.map((item) => clone(item));
    }
    if (isObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
    }
    return value;
};
export function deepMerge(target, source) {
    if (!source)
        return target;
    for (const [key, value] of Object.entries(source)) {
        if (Array.isArray(value)) {
            target[key] = value.map((item) => clone(item));
            continue;
        }
        if (isObject(value)) {
            const existing = target[key];
            const child = isObject(existing) ? existing : {};
            target[key] = deepMerge(child, value);
            continue;
        }
        target[key] = value;
    }
    return target;
}
export function deepClone(value) {
    return clone(value);
}
//# sourceMappingURL=deepMerge.js.map