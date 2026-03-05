import { evaluateTrialOutcome, } from "../web/outcome";
export function createHookStateStore(initial) {
    const source = new Map();
    if (initial && typeof initial === "object") {
        for (const [key, value] of Object.entries(initial)) {
            source.set(key, value);
        }
    }
    const state = {
        _source: source,
        get(key) {
            return source.get(String(key));
        },
        set(key, value) {
            source.set(String(key), value);
        },
        update(key, updater) {
            const normalizedKey = String(key);
            const next = updater(source.get(normalizedKey));
            source.set(normalizedKey, next);
            return next;
        },
        delete(key) {
            source.delete(String(key));
        },
        clear() {
            source.clear();
        },
        entries() {
            return Array.from(source.entries());
        },
    };
    return state;
}
export function prepareTaskHooks(hooks, options = {}) {
    if (!Array.isArray(hooks) || hooks.length === 0)
        return [];
    const prefix = options.defaultPrefix?.trim() || "hook";
    const normalized = [];
    for (let index = 0; index < hooks.length; index += 1) {
        const hook = hooks[index];
        if (!hook || hook.enabled === false)
            continue;
        const id = (hook.id ?? `${prefix}_${index + 1}`).trim();
        const priority = Number.isFinite(hook.priority) ? Number(hook.priority) : 0;
        normalized.push({
            ...hook,
            id,
            order: normalized.length,
            priority,
        });
    }
    normalized.sort((a, b) => {
        const pa = Number.isFinite(a.priority) ? Number(a.priority) : 0;
        const pb = Number.isFinite(b.priority) ? Number(b.priority) : 0;
        if (pa !== pb)
            return pa - pb;
        return a.order - b.order;
    });
    return normalized;
}
function handleHookError(error, context, options) {
    options?.onError?.(error, context);
    if (!options?.continueOnError) {
        throw error;
    }
}
export async function runTaskHookLifecycle(args) {
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "task_hook" });
    if (hooks.length === 0)
        return;
    const state = args.state ?? createHookStateStore();
    for (const hook of hooks) {
        const context = {
            ...(args.context ?? {}),
            hookId: hook.id,
            state,
        };
        try {
            if (args.phase === "task_start")
                await hook.onTaskStart?.(context);
            if (args.phase === "task_end")
                await hook.onTaskEnd?.(context);
            if (args.phase === "block_start")
                await hook.onBlockStart?.(context);
            if (args.phase === "block_end")
                await hook.onBlockEnd?.(context);
            if (args.phase === "trial_start")
                await hook.onTrialStart?.(context);
            if (args.phase === "trial_end")
                await hook.onTrialEnd?.(context);
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: args.phase }, args.options);
        }
    }
}
export async function emitTaskHookEvent(args) {
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "task_hook" });
    if (hooks.length === 0)
        return;
    const state = args.state ?? createHookStateStore();
    const eventPhase = args.event.phase ?? "custom";
    for (const hook of hooks) {
        const context = {
            ...(args.context ?? {}),
            event: args.event,
            hookId: hook.id,
            state,
        };
        try {
            await hook.onEvent?.(context);
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: eventPhase, eventName: args.event.name }, args.options);
        }
    }
}
export function evaluateTrialOutcomeWithHooks(args) {
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "outcome_hook" });
    const state = args.state ?? createHookStateStore();
    let input = {
        responseCategory: args.responseCategory,
        rt: args.rt,
        stimulusCategory: args.stimulusCategory,
        expectedCategory: args.expectedCategory,
        meta: args.meta,
        evaluator: args.evaluator,
    };
    for (const hook of hooks) {
        try {
            const patch = hook.beforeEvaluate?.(input, { hookId: hook.id, state });
            if (!patch || typeof patch?.then === "function") {
                if (patch && typeof patch?.then === "function") {
                    throw new Error(`Hook '${hook.id}' returned a Promise in sync outcome evaluation. Use evaluateTrialOutcomeWithHooksAsync.`);
                }
                continue;
            }
            input = { ...input, ...patch };
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "beforeEvaluate" }, args.options);
        }
    }
    let outcome = evaluateTrialOutcome(input);
    for (const hook of hooks) {
        try {
            const patch = hook.afterEvaluate?.({ input, outcome }, { hookId: hook.id, state });
            if (!patch || typeof patch?.then === "function") {
                if (patch && typeof patch?.then === "function") {
                    throw new Error(`Hook '${hook.id}' returned a Promise in sync outcome evaluation. Use evaluateTrialOutcomeWithHooksAsync.`);
                }
                continue;
            }
            outcome = { ...outcome, ...patch };
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "afterEvaluate" }, args.options);
        }
    }
    return outcome;
}
export async function evaluateTrialOutcomeWithHooksAsync(args) {
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "outcome_hook" });
    const state = args.state ?? createHookStateStore();
    let input = {
        responseCategory: args.responseCategory,
        rt: args.rt,
        stimulusCategory: args.stimulusCategory,
        expectedCategory: args.expectedCategory,
        meta: args.meta,
        evaluator: args.evaluator,
    };
    for (const hook of hooks) {
        try {
            const patch = await hook.beforeEvaluate?.(input, { hookId: hook.id, state });
            if (!patch)
                continue;
            input = { ...input, ...patch };
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "beforeEvaluate" }, args.options);
        }
    }
    let outcome = evaluateTrialOutcome(input);
    for (const hook of hooks) {
        try {
            const patch = await hook.afterEvaluate?.({ input, outcome }, { hookId: hook.id, state });
            if (!patch)
                continue;
            outcome = { ...outcome, ...patch };
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "afterEvaluate" }, args.options);
        }
    }
    return outcome;
}
export function applyTrialPlanHooks(trialOrArgs, legacyContext, legacyHooks) {
    const args = isApplyTrialPlanHooksArgs(trialOrArgs)
        ? trialOrArgs
        : {
            trial: trialOrArgs,
            context: legacyContext,
            hooks: legacyHooks,
        };
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "plan_hook" });
    if (hooks.length === 0)
        return args.trial;
    const state = args.state ?? createHookStateStore();
    let current = args.trial;
    for (const hook of hooks) {
        try {
            const next = hook.onTrialPlanned?.({
                ...args.context,
                trial: current,
                hookId: hook.id,
                state,
            });
            if (next === undefined)
                continue;
            if (typeof next?.then === "function") {
                throw new Error(`Hook '${hook.id}' returned a Promise in sync planning. Use applyTrialPlanHooksAsync.`);
            }
            current = next;
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "onTrialPlanned" }, args.options);
        }
    }
    return current;
}
export async function applyTrialPlanHooksAsync(args) {
    const hooks = prepareTaskHooks(args.hooks, { defaultPrefix: "plan_hook" });
    if (hooks.length === 0)
        return args.trial;
    const state = args.state ?? createHookStateStore();
    let current = args.trial;
    for (const hook of hooks) {
        try {
            const next = await hook.onTrialPlanned?.({
                ...args.context,
                trial: current,
                hookId: hook.id,
                state,
            });
            if (next !== undefined)
                current = next;
        }
        catch (error) {
            handleHookError(error, { hookId: hook.id, phase: "custom", eventName: "onTrialPlanned" }, args.options);
        }
    }
    return current;
}
function isApplyTrialPlanHooksArgs(value) {
    if (!value || typeof value !== "object")
        return false;
    return "trial" in value && "context" in value;
}
//# sourceMappingURL=taskHooks.js.map