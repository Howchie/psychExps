export function generateProspectiveMemoryPositions(rng, nTrials, schedule) {
    const nPm = Math.max(0, Math.floor(schedule.count));
    const minSep = Math.max(1, Math.floor(schedule.minSeparation));
    const maxSep = Math.max(minSep, Math.floor(schedule.maxSeparation));
    if (nPm <= 0)
        return [];
    if (nPm * minSep > nTrials - 1) {
        throw new Error(`Cannot place ${nPm} PM trials in ${nTrials} trials.`);
    }
    const positions = [];
    let lastPos = 0;
    for (let i = 0; i < nPm; i += 1) {
        const remaining = nPm - i - 1;
        const minPos = lastPos + minSep;
        const latestByMaxGap = lastPos + maxSep;
        const latestByRemaining = nTrials - 1 - remaining * minSep;
        const maxPos = Math.min(latestByMaxGap, latestByRemaining);
        if (minPos > maxPos) {
            throw new Error(`Cannot place PM trial ${i + 1}/${nPm}.`);
        }
        const pos = rng.int(minPos, maxPos);
        positions.push(pos);
        lastPos = pos;
    }
    return positions;
}
export function resolveProspectiveMemoryCueMatch(context, rules) {
    for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (matchesRule(context, rule)) {
            return {
                matched: true,
                responseKey: rule.responseKey,
                ruleId: rule.id ?? `rule_${i + 1}`,
            };
        }
    }
    return { matched: false, responseKey: null, ruleId: null };
}
function normalizeToken(value, caseSensitive) {
    const token = String(value ?? "");
    return caseSensitive ? token : token.toLowerCase();
}
function matchesRule(context, rule) {
    if (rule.type === "category_in") {
        const value = normalizeToken(context.category ?? "", false);
        if (!value)
            return false;
        const allowed = new Set(rule.categories.map((entry) => normalizeToken(entry, false)));
        return allowed.has(value);
    }
    if (rule.type === "text_starts_with") {
        const caseSensitive = rule.caseSensitive === true;
        const text = normalizeToken(context.stimulusText ?? "", caseSensitive);
        if (!text)
            return false;
        return rule.prefixes.some((prefix) => text.startsWith(normalizeToken(prefix, caseSensitive)));
    }
    if (rule.type === "stimulus_color") {
        const caseSensitive = rule.caseSensitive === true;
        const color = normalizeToken(context.stimulusColor ?? "", caseSensitive);
        if (!color)
            return false;
        const allowed = new Set(rule.colors.map((entry) => normalizeToken(entry, caseSensitive)));
        return allowed.has(color);
    }
    const actual = context.flags?.[rule.flag];
    return actual === rule.value;
}
//# sourceMappingURL=prospectiveMemory.js.map