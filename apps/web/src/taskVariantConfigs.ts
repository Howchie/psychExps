import type { JSONObject } from "@experiments/core";

type JsonModule = { default?: unknown } | unknown;

const bundledConfigs = import.meta.glob("../../../configs/**/*.json", { eager: true }) as Record<string, JsonModule>;

// All JSON files under configs/**/*.json are auto-discovered at build time.
// No per-task registration is needed — add a new config file and it will be
// available as a variant configPath immediately.
export const taskConfigsByPath: Record<string, JSONObject> = Object.fromEntries(
  Object.entries(bundledConfigs)
    .map(([modulePath, mod]) => {
      const rel = modulePath.replace(/^.*\/configs\//, "").replace(/\.json$/, "");
      const value = ((mod as { default?: unknown })?.default ?? mod) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      return [rel, value as JSONObject] as const;
    })
    .filter((entry): entry is readonly [string, JSONObject] => Boolean(entry)),
);
