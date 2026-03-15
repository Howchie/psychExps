import { readJatosSelectionInput, readJatosUrlQueryParameters, isJatosAvailable } from "../infrastructure/jatos";
import { resolveParticipantIds } from "../infrastructure/participant";
import { parseOverridesFromUrl } from "../infrastructure/config";
import type { CoreConfig, Platform, SelectionContext, JSONObject } from "../api/types";

function detectPlatform(params: URLSearchParams): Platform {
  if (isJatosAvailable()) return "jatos";
  if (params.get("PROLIFIC_PID") || params.get("STUDY_ID") || params.get("SESSION_ID")) return "prolific";
  if (params.get("SONA_ID")) return "sona";
  return "local";
}

function mergeQueryParams(primary: URLSearchParams, fallback: URLSearchParams): URLSearchParams {
  const merged = new URLSearchParams(primary.toString());
  for (const [key, value] of fallback.entries()) {
    if (merged.has(key)) continue;
    merged.append(key, value);
  }
  return merged;
}

function asObject(value: unknown): JSONObject | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JSONObject;
      }
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JSONObject;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseBooleanParam(value: string | null): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "n"].includes(normalized)) return false;
  return null;
}

function pickFirstString(source: JSONObject | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = asNonEmptyString(source[key]);
    if (value) return value;
  }
  return null;
}

function extractStringLike(value: unknown): string | null {
  const direct = asNonEmptyString(value);
  if (direct) return direct;
  const obj = asObject(value);
  if (!obj) return null;
  return (
    pickFirstString(obj, ["id", "name", "key", "value", "taskId", "task", "variantId", "variant", "experiment"])
    ?? null
  );
}

function pickFirstSelectionValue(source: JSONObject | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = extractStringLike(source[key]);
    if (value) return value;
  }
  return null;
}

export function resolveSelection(coreConfig: CoreConfig): SelectionContext {
  const browserParams = new URLSearchParams(window.location.search);
  const params = isJatosAvailable()
    ? mergeQueryParams(browserParams, readJatosUrlQueryParameters())
    : browserParams;
  const jatosInput = asObject(readJatosSelectionInput());
  const jatosSelection = asObject(jatosInput?.selection);
  const jatosExperiment = asObject(jatosInput?.experiment);
  const jatosParams = asObject(jatosInput?.params);
  const jatosVariables = asObject(jatosInput?.variables);
  const jatosConfig = asObject(jatosInput?.config);
  const jatosTaskObject = asObject(jatosInput?.task);
  const jatosVariantObject = asObject(jatosInput?.variant);

  const urlTask = asNonEmptyString(params.get("task"));
  const urlVariant = asNonEmptyString(params.get("variant"));

  const taskKeys = ["taskId", "task", "task_id", "experiment", "experimentId", "experiment_id", "paradigm"];
  const variantKeys = ["variantId", "variant", "variant_id", "condition", "arm", "version"];

  const jatosTask = pickFirstSelectionValue(jatosInput, taskKeys)
    ?? pickFirstSelectionValue(jatosSelection, taskKeys)
    ?? pickFirstSelectionValue(jatosExperiment, taskKeys)
    ?? pickFirstSelectionValue(jatosParams, taskKeys)
    ?? pickFirstSelectionValue(jatosVariables, taskKeys)
    ?? pickFirstSelectionValue(jatosConfig, taskKeys)
    ?? pickFirstSelectionValue(jatosTaskObject, taskKeys);

  const jatosVariant = pickFirstSelectionValue(jatosInput, variantKeys)
    ?? pickFirstSelectionValue(jatosSelection, variantKeys)
    ?? pickFirstSelectionValue(jatosExperiment, variantKeys)
    ?? pickFirstSelectionValue(jatosParams, variantKeys)
    ?? pickFirstSelectionValue(jatosVariables, variantKeys)
    ?? pickFirstSelectionValue(jatosConfig, variantKeys)
    ?? pickFirstSelectionValue(jatosVariantObject, variantKeys);

  const taskId = jatosTask ?? urlTask ?? coreConfig.selection.taskId;
  const variantId = jatosVariant ?? urlVariant ?? coreConfig.selection.variantId;

  const taskSource: SelectionContext["source"]["task"] = jatosTask ? "jatos" : urlTask ? "url" : "default";
  const variantSource: SelectionContext["source"]["variant"] = jatosVariant ? "jatos" : urlVariant ? "url" : "default";

  const participant = resolveParticipantIds(params, coreConfig.participant);

  const urlOverrides = parseOverridesFromUrl(params);
  const jatosOverrides = asObject(jatosInput?.overrides);

  return {
    platform: detectPlatform(params),
    taskId,
    variantId,
    configPath: asNonEmptyString(params.get("config")),
    overrides: jatosOverrides ?? urlOverrides,
    auto: parseBooleanParam(params.get("auto")),
    participant,
    completionCode: asNonEmptyString(params.get("cc")),
    source: {
      task: taskSource,
      variant: variantSource,
    },
  };
}
