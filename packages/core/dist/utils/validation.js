const asObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const forbiddenByTask = {
    sft: ["nback_pm_old", "bricks"],
    nback_pm_old: ["sft", "bricks"],
    bricks: ["sft", "nback_pm_old"],
};
export function validateTaskConfigIsolation(taskId, config, knownTaskIds) {
    const task = asObject(config.task) ? config.task : {};
    const forbiddenRoots = Array.isArray(knownTaskIds) && knownTaskIds.length > 0
        ? knownTaskIds.filter((id) => id !== taskId)
        : forbiddenByTask[taskId] ?? [];
    const rootKeys = Object.keys(config);
    for (const key of forbiddenRoots) {
        if (rootKeys.includes(key)) {
            throw new Error(`Config isolation violation: task '${taskId}' config includes forbidden root key '${key}'.`);
        }
        if (asObject(task) && key in task) {
            throw new Error(`Config isolation violation: task '${taskId}' config includes forbidden task namespace key 'task.${key}'.`);
        }
    }
}
export function validateCoreSelectionDefaults(config) {
    const selection = asObject(config.selection) ? config.selection : null;
    if (!selection) {
        throw new Error("Core config must include selection defaults.");
    }
    const taskId = selection.taskId;
    const variantId = selection.variantId;
    if (typeof taskId !== "string" || !taskId.trim()) {
        throw new Error("core.selection.taskId must be non-empty.");
    }
    if (typeof variantId !== "string" || !variantId.trim()) {
        throw new Error("core.selection.variantId must be non-empty.");
    }
}
//# sourceMappingURL=validation.js.map