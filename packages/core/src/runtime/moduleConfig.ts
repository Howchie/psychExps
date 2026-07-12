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

/**
 * Resolve the single block-scoped config for a module across all trial configs in a block.
 *
 * A block-scoped module (e.g. a block-long DRT) must be configured identically on every
 * trial of the block; when trials disagree, the first resolved config wins and a warning
 * is emitted so misconfigured presets are visible during development.
 */
export function resolveUniformBlockScopedModuleConfig<T extends { enabled: boolean; scope: string }>(args: {
  trialConfigs: Array<Record<string, unknown>>;
  moduleId: string;
  coerce: (raw: Record<string, unknown> | null) => T;
  warnLabel?: string;
}): T | null {
  const blockScoped = args.trialConfigs
    .map((trialConfig) => args.coerce(resolveScopedModuleConfig(trialConfig, args.moduleId)))
    .filter((entry) => entry.enabled && entry.scope === "block");
  if (blockScoped.length === 0) return null;
  const canonical = JSON.stringify(blockScoped[0]);
  const hasMismatch = blockScoped.some((entry) => JSON.stringify(entry) !== canonical);
  if (hasMismatch) {
    const label = args.warnLabel ?? args.moduleId;
    console.warn(
      `${label} config includes mismatched block-scoped "${args.moduleId}" settings within one block; using the first resolved config.`,
    );
  }
  return blockScoped[0];
}
