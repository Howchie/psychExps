import type { TaskAdapter } from "./taskAdapter";

export function buildTaskMap(adapters: TaskAdapter[]): Map<string, TaskAdapter> {
  return new Map(adapters.map((adapter) => [adapter.manifest.taskId, adapter]));
}
