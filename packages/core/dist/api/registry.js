export function buildTaskMap(adapters) {
    return new Map(adapters.map((adapter) => [adapter.manifest.taskId, adapter]));
}
export function getVariantOrThrow(task, variantId) {
    const variant = task.manifest.variants.find((entry) => entry.id === variantId);
    if (!variant) {
        const known = task.manifest.variants.map((entry) => entry.id).join(", ");
        throw new Error(`Unknown variant '${variantId}' for task '${task.manifest.taskId}'. Known: ${known}`);
    }
    return variant;
}
//# sourceMappingURL=registry.js.map