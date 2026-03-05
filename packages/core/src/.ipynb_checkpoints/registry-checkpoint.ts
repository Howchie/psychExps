import type { TaskAdapter, TaskVariantManifest } from "./types";

export function buildTaskMap(adapters: TaskAdapter[]): Map<string, TaskAdapter> {
  return new Map(adapters.map((adapter) => [adapter.manifest.taskId, adapter]));
}

export function getVariantOrThrow(task: TaskAdapter, variantId: string): TaskVariantManifest {
  const variant = task.manifest.variants.find((entry) => entry.id === variantId);
  if (!variant) {
    const known = task.manifest.variants.map((entry) => entry.id).join(", ");
    throw new Error(`Unknown variant '${variantId}' for task '${task.manifest.taskId}'. Known: ${known}`);
  }
  return variant;
}
