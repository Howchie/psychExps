import type { TaskVariantManifest } from "./types";
import type { TaskAdapter } from "./taskAdapter";
export declare function buildTaskMap(adapters: TaskAdapter[]): Map<string, TaskAdapter>;
export declare function getVariantOrThrow(task: TaskAdapter, variantId: string): TaskVariantManifest;
