export function normalizeKey(key) {
    const normalized = String(key || "").toLowerCase();
    if (normalized === " " || normalized === "spacebar" || normalized === "space")
        return "space";
    return normalized;
}
//# sourceMappingURL=keys.js.map