import { asObject } from "../utils/coerce";

export function resolveScopedModuleConfig(
  raw: Record<string, unknown> | null | undefined,
  moduleId: string,
): Record<string, unknown> | null {
  const source = asObject(raw);
  if (!source) return null;
  const taskModules = asObject(asObject(source.task)?.modules);
  const localModules = asObject(source.modules);
  return asObject(localModules?.[moduleId]) ?? asObject(taskModules?.[moduleId]) ?? null;
}
