import type { JSONObject } from "@experiments/core";

type JsonModule = { default?: unknown } | unknown;

const bundledConfigs = import.meta.glob("../../../configs/**/*.json", { eager: true }) as Record<string, JsonModule>;

export const taskDefaults: Record<string, JSONObject> = {
  sft: {},
  nback_pm_old: {},
  nback: {},
  bricks: {},
  stroop: {},
  tracking: {},
  change_detection: {},
};

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
