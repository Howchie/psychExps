export function normalizeKey(key: string): string {
  const normalized = String(key || "").toLowerCase();
  if (normalized === " " || normalized === "spacebar" || normalized === "space") return "space";
  return normalized;
}
