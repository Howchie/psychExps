import type { JSONObject } from "./types";

const asObject = (value: unknown): value is JSONObject =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const forbiddenByTask: Record<string, string[]> = {
  sft: ["pm", "bricks"],
  pm: ["sft", "bricks"],
  bricks: ["sft", "pm"],
};

export function validateTaskConfigIsolation(taskId: string, config: JSONObject, knownTaskIds?: string[]): void {
  const task = asObject(config.task) ? config.task : {};
  const forbiddenRoots =
    Array.isArray(knownTaskIds) && knownTaskIds.length > 0
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

export function validateCoreSelectionDefaults(config: JSONObject): void {
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
