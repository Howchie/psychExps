import type { TaskAdapter, TaskVariantManifest } from "./types";
export declare function buildTaskMap(adapters: TaskAdapter[]): Map<string, TaskAdapter>;
export declare function getVariantOrThrow(task: TaskAdapter, variantId: string): TaskVariantManifest;
