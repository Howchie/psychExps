import { generateProspectiveMemoryPositions } from "./prospectiveMemory";
import { coercePoolDrawConfig, createPoolDrawer } from "../infrastructure/pools";
import { asObject, asString } from "../utils/coerce";
export class StimulusInjectorModule {
    id = "injector";
    participantScopedDrawers = new Map();
    transformBlockPlan(block, config, context) {
        if (!config.enabled || !context.rng)
            return block;
        const injections = Array.isArray(config.injections) ? config.injections : [];
        if (injections.length === 0)
            return block;
        let currentBlock = block;
        for (let i = 0; i < injections.length; i += 1) {
            const injection = injections[i];
            if (!injection || injection.enabled === false)
                continue;
            currentBlock = this.applyInjection(currentBlock, injection, i, context);
        }
        return currentBlock;
    }
    getModularSemantics(config) {
        if (!config.enabled)
            return {};
        const out = {};
        for (const injection of Array.isArray(config.injections) ? config.injections : []) {
            if (!injection || injection.enabled === false)
                continue;
            const category = String(injection.set?.responseCategory ?? "").trim();
            const key = String(injection.set?.correctResponse ?? "").trim();
            if (!category || !key)
                continue;
            const existing = out[category] ?? [];
            if (!existing.includes(key))
                existing.push(key);
            out[category] = existing;
        }
        return out;
    }
    start(_config, _address, _context) {
        return {
            stop: () => ({ applied: [] }),
        };
    }
    applyInjection(block, injection, injectionIndex, context) {
        const trials = Array.isArray(block?.trials) ? block.trials : [];
        if (trials.length === 0)
            return block;
        const eligibleIndices = trials
            .map((t, idx) => ({ trialType: String(t?.trialType ?? ""), idx }))
            .filter((entry) => {
            if (!Array.isArray(injection.eligibleTrialTypes) || injection.eligibleTrialTypes.length === 0)
                return true;
            return injection.eligibleTrialTypes.includes(entry.trialType);
        })
            .map((entry) => entry.idx);
        if (eligibleIndices.length === 0)
            return block;
        const positions = generateProspectiveMemoryPositions(context.rng, trials.length, injection.schedule, new Set(eligibleIndices));
        if (positions.length === 0)
            return block;
        const nextTrials = [...trials];
        const injectionId = String(injection.id ?? `inj_${injectionIndex + 1}`);
        const draw = this.createDrawerWithConfig(injection.source, injection.sourceDraw ?? null, context, injectionId);
        for (const pos of positions) {
            const base = nextTrials[pos];
            if (!base)
                continue;
            const pick = draw();
            const set = injection.set ?? {};
            nextTrials[pos] = {
                ...base,
                item: pick.item,
                sourceCategory: pick.sourceCategory,
                ...(set.trialType ? { trialType: set.trialType } : {}),
                ...(set.itemCategory ? { itemCategory: set.itemCategory } : {}),
                ...(set.correctResponse ? { correctResponse: set.correctResponse } : {}),
                ...(set.responseCategory ? { expectedCategory: set.responseCategory } : {}),
                injectionId,
            };
        }
        return {
            ...block,
            trials: nextTrials,
            injectionLog: [
                ...(Array.isArray(block?.injectionLog) ? block.injectionLog : []),
                { id: injectionId, positions },
            ],
        };
    }
    createDrawerWithConfig(source, sourceDrawRaw, context, injectionId) {
        const sourceDraw = this.coerceSourceDrawConfig(sourceDrawRaw);
        const candidates = this.collectCandidates(source, context);
        if (candidates.length === 0) {
            const fallbackCategory = source.type === "literal"
                ? String(source.sourceCategory ?? "literal")
                : "unknown";
            return () => ({ item: "injected_item", sourceCategory: fallbackCategory });
        }
        const buildDrawer = () => {
            const draw = createPoolDrawer(candidates.map((pick) => ({ item: pick.item, category: pick.sourceCategory })), context.rng, { mode: sourceDraw.mode, shuffle: sourceDraw.shuffle });
            return () => {
                const picked = draw();
                return { item: picked.item, sourceCategory: picked.category };
            };
        };
        if (sourceDraw.scope !== "participant")
            return buildDrawer();
        const scopedId = this.makeParticipantScopedDrawerId(source, sourceDraw, injectionId);
        const existing = this.participantScopedDrawers.get(scopedId);
        if (existing)
            return existing;
        const created = buildDrawer();
        this.participantScopedDrawers.set(scopedId, created);
        return created;
    }
    coerceSourceDrawConfig(value) {
        const raw = asObject(value);
        const draw = coercePoolDrawConfig(raw, { mode: "without_replacement", shuffle: true });
        const scopeRaw = asString(raw?.scope)?.toLowerCase();
        const scope = scopeRaw === "participant" ? "participant" : "block";
        return { mode: draw.mode, shuffle: draw.shuffle, scope };
    }
    makeParticipantScopedDrawerId(source, sourceDraw, injectionId) {
        const sourceKey = source.type === "literal"
            ? JSON.stringify({
                type: source.type,
                sourceCategory: source.sourceCategory ?? "literal",
                items: source.items ?? [],
            })
            : JSON.stringify({
                type: source.type,
                categories: source.categories ?? [],
            });
        return JSON.stringify({
            injectionId: injectionId ?? "injector",
            draw: sourceDraw,
            source: sourceKey,
        });
    }
    collectCandidates(source, context) {
        if (source.type === "literal") {
            const items = Array.isArray(source.items) ? source.items.map((item) => String(item)).filter(Boolean) : [];
            const sourceCategory = String(source.sourceCategory ?? "literal");
            return items.map((item) => ({ item, sourceCategory }));
        }
        const categories = Array.isArray(source.categories)
            ? source.categories.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
        const categoryPools = context.stimuliByCategory ?? {};
        const validCategories = categories.filter((category) => Array.isArray(categoryPools[category]) && categoryPools[category].length > 0);
        const out = [];
        for (const category of validCategories) {
            for (const item of categoryPools[category]) {
                out.push({ item, sourceCategory: category });
            }
        }
        return out;
    }
}
//# sourceMappingURL=stimulusInjector.js.map