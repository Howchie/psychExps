function normalizePathLike(value: string): string {
  return value.trim().replace(/^\/+/, "");
}

function stripJsonSuffix(value: string): string {
  return value.endsWith(".json") ? value.slice(0, -5) : value;
}

function maybeExtractConfigsRelative(value: string): string | null {
  const normalized = normalizePathLike(value);
  if (normalized.startsWith("configs/")) return normalized.slice("configs/".length);
  return null;
}

export function toBundledConfigKey(value: string): string {
  const normalized = normalizePathLike(value);
  const configsRelative = maybeExtractConfigsRelative(normalized);
  return stripJsonSuffix(configsRelative ?? normalized);
}

export function toConfigFetchPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.endsWith(".json")) return trimmed;
  const path = `/configs/${trimmed}.json`;
  const hasWindow = typeof window !== "undefined";
  const hasJatos = hasWindow && typeof (window as { jatos?: unknown }).jatos !== "undefined";
  return hasJatos ? path.replace(/^\/+/, "") : path;
}

function dedupe(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildConfigReferenceCandidates(args: {
  requestedConfig: string;
  taskId: string;
}): string[] {
  const requested = args.requestedConfig.trim();
  if (!requested) return [];
  const keyed = stripJsonSuffix(requested);
  const isPathLike = keyed.includes("/");
  if (isPathLike) {
    return dedupe([requested]);
  }
  return dedupe([`${args.taskId}/${keyed}`, requested]);
}
