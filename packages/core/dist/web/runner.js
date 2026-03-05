import { asObject, asString } from "../utils/coerce";
export function resolveRunnerPreference(taskConfig) {
    const root = asObject(taskConfig);
    const taskNode = asObject(root?.task);
    const explicit = asString(root?.runner) || asString(taskNode?.runner);
    if (explicit === "native" || explicit === "jspsych")
        return explicit;
    const implementation = asString(taskNode?.implementation);
    if (!implementation)
        return null;
    if (implementation.startsWith("jspsych_"))
        return "jspsych";
    if (implementation.startsWith("native_"))
        return "native";
    return null;
}
export function selectRunner(args) {
    const supported = args.supportedRunners ?? [];
    if (supported.length === 0) {
        throw new Error("selectRunner requires at least one supported runner");
    }
    const byId = new Map();
    for (const runner of supported) {
        byId.set(runner.id, runner);
    }
    const preferenceOrder = [
        args.preferredRunner ?? null,
        resolveRunnerPreference(args.taskConfig),
        args.defaultRunner ?? "native",
    ];
    for (const preferred of preferenceOrder) {
        if (!preferred)
            continue;
        const runner = byId.get(preferred);
        if (!runner)
            continue;
        return { runnerId: preferred, runner };
    }
    const fallback = supported[0];
    return { runnerId: fallback.id, runner: fallback };
}
export async function runWithRunner(args) {
    const selected = selectRunner(args);
    const result = await selected.runner.run(args.context);
    return { ...selected, result };
}
//# sourceMappingURL=runner.js.map