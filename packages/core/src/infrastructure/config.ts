import { deepClone, deepMerge } from "../infrastructure/deepMerge";
import type { JSONObject } from "../api/types";
import type { VariableResolver } from "./variables";
import { resolveRuntimePath } from "./runtimePaths";

/**
 * Manages loading and merging of experiment configurations.
 */
export class ConfigurationManager {
  /**
   * Loads a JSON configuration file from the specified path.
   */
  async load(path: string): Promise<JSONObject> {
    const resolvedPath = resolveRuntimePath(path);
    const response = await fetch(resolvedPath, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load config at ${resolvedPath} (HTTP ${response.status})`);
    }
    const parsed = (await response.json()) as JSONObject;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Config is not an object: ${resolvedPath}`);
    }
    return parsed;
  }

  /**
   * Validates the configuration for legacy top-level keys.
   * Throws a Hard Error if 'drt' or 'pm' are found at the root.
   */
  validateLegacyKeys(config: JSONObject): void {
    if (config.drt) {
      throw new Error(
        "Legacy configuration detected: Top-level 'drt' key is no longer supported. " +
        "Please move DRT configuration to 'task.modules.drt'."
      );
    }
    if (config.pm) {
      throw new Error(
        "Legacy configuration detected: Top-level 'pm' key is no longer supported. " +
        "Please move Prospective Memory configuration to 'task.modules.injector.injections'."
      );
    }
  }

  /**
   * Merges multiple configuration levels in sequence:
   * base -> taskDefault -> variantOverride -> runtimeOverride
   */
  merge(
    base: JSONObject,
    taskDefault: JSONObject,
    variantOverride: JSONObject,
    runtimeOverride?: JSONObject | null,
  ): JSONObject {
    const merged = deepClone(base);
    deepMerge(merged, taskDefault);
    deepMerge(merged, variantOverride);
    if (runtimeOverride) {
      deepMerge(merged, runtimeOverride);
    }
    return merged;
  }

  /**
   * Resolves variables in the configuration using the provided resolver.
   */
  resolve(config: JSONObject, resolver: VariableResolver): JSONObject {
    return resolver.resolveInValue(config);
  }
}

/**
 * LEGACY: Standalone function for loading JSON files.
 * Prefer ConfigurationManager.load().
 */
export async function loadJsonFile(path: string): Promise<JSONObject> {
  return new ConfigurationManager().load(path);
}

/**
 * Standalone function for parsing overrides from URL parameters.
 */
export function parseOverridesFromUrl(params: URLSearchParams): JSONObject | null {
  const raw = params.get("overrides");
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as JSONObject;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * LEGACY: Standalone function for merging configurations.
 * Prefer ConfigurationManager.merge().
 */
export function buildMergedConfig(
  base: JSONObject,
  taskDefault: JSONObject,
  variantOverride: JSONObject,
  runtimeOverride?: JSONObject | null,
): JSONObject {
  return new ConfigurationManager().merge(base, taskDefault, variantOverride, runtimeOverride);
}
