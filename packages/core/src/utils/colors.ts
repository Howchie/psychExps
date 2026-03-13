export interface ColorRegistryOptions {
  normalizeToken?: (token: string) => string;
  fallbackColor?: string | null;
}

export interface ColorRegistry {
  resolve(token: string | null | undefined): string | null;
  has(token: string): boolean;
  token(token: string): string;
  entries(): Array<{ token: string; color: string }>;
}

const defaultNormalizeToken = (token: string): string => String(token || "").trim().toLowerCase();

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE = /^rgba?\(([^)]+)\)$/i;
const HSL_COLOR_RE = /^hsla?\(([^)]+)\)$/i;
const CSS_VAR_RE = /^var\(--[^)]+\)$/i;
const NAMED_COLOR_RE = /^[a-z]+$/i;

export function isLikelyCssColor(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    HEX_COLOR_RE.test(text) ||
    RGB_COLOR_RE.test(text) ||
    HSL_COLOR_RE.test(text) ||
    CSS_VAR_RE.test(text) ||
    NAMED_COLOR_RE.test(text)
  );
}

export function normalizeColorToken(token: string, normalize = defaultNormalizeToken): string {
  return normalize(token);
}

export function createColorRegistry(
  tokenToColor: Record<string, string>,
  options: ColorRegistryOptions = {},
): ColorRegistry {
  const normalize = options.normalizeToken ?? defaultNormalizeToken;
  const fallbackColor = options.fallbackColor ?? null;
  const map = new Map<string, string>();

  for (const [rawToken, rawColor] of Object.entries(tokenToColor ?? {})) {
    const token = normalize(rawToken);
    const color = String(rawColor || "").trim();
    if (!token) continue;
    if (!color) throw new Error(`Color registry token '${rawToken}' has empty color value.`);
    if (!isLikelyCssColor(color)) {
      throw new Error(`Color registry token '${rawToken}' has invalid CSS color '${color}'.`);
    }
    map.set(token, color);
  }

  return {
    resolve(tokenLike: string | null | undefined): string | null {
      const token = normalize(String(tokenLike || ""));
      if (!token) return fallbackColor;
      return map.get(token) ?? fallbackColor;
    },
    has(tokenLike: string): boolean {
      const token = normalize(String(tokenLike || ""));
      if (!token) return false;
      return map.has(token);
    },
    token(tokenLike: string): string {
      return normalize(String(tokenLike || ""));
    },
    entries(): Array<{ token: string; color: string }> {
      return Array.from(map.entries()).map(([token, color]) => ({ token, color }));
    },
  };
}

export function resolveColorToken(
  tokenToColor: Record<string, string>,
  token: string | null | undefined,
  options: ColorRegistryOptions = {},
): string | null {
  return createColorRegistry(tokenToColor, options).resolve(token);
}
