import type { JSONObject } from "./types";

const isObject = (value: unknown): value is JSONObject =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const clone = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
};

export function deepMerge<T extends JSONObject>(target: T, source: JSONObject | null | undefined): T {
  if (!source) return target;
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      (target as JSONObject)[key] = value.map((item) => clone(item));
      continue;
    }
    if (isObject(value)) {
      const existing = (target as JSONObject)[key];
      const child = isObject(existing) ? existing : {};
      (target as JSONObject)[key] = deepMerge(child, value);
      continue;
    }
    (target as JSONObject)[key] = value;
  }
  return target;
}

export function deepClone<T>(value: T): T {
  return clone(value);
}
