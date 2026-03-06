export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function toNonNegativeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function toUnitNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toNumberArray(value: unknown, fallback: number[]): number[] {
  const out = asArray(value).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry)) as number[];
  return out.length > 0 ? out : fallback;
}

export function toStringScreens(value: unknown): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  return asArray(value).map((item) => asString(item)).filter((item): item is string => Boolean(item));
}

export function asStringArray(value: unknown, fallback: string[]): string[] {
  const list = asArray(value).map((item) => asString(item)).filter((item): item is string => Boolean(item));
  return list.length > 0 ? list : [...fallback];
}

export function asPositiveNumberArray(value: unknown, fallback: number[]): number[] {
  const list = asArray(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.floor(entry));
  return list.length > 0 ? list : [...fallback];
}

export interface InstructionPageSlots {
  intro: string[];
  preBlock: string[];
  postBlock: string[];
  end: string[];
}

export interface InstructionScreenSpec {
  title?: string;
  text?: string;
  html?: string;
}

export function resolveInstructionPageSlots(
  instructions: unknown,
  defaults?: Partial<InstructionPageSlots>,
): InstructionPageSlots {
  const raw = asObject(instructions);
  const hasOwn = (key: string): boolean => Boolean(raw && Object.prototype.hasOwnProperty.call(raw, key));
  const pickFirstScreens = (keys: string[], fallback?: string[]): string[] => {
    for (const key of keys) {
      if (!hasOwn(key)) continue;
      // Explicitly present empty/blank values are treated as intentional clear.
      return toStringScreens(raw?.[key]);
    }
    return toStringScreens(fallback);
  };
  return {
    intro: pickFirstScreens(["pages", "introPages", "intro", "screens"], defaults?.intro),
    preBlock: pickFirstScreens(["preBlockPages", "beforeBlockPages", "beforeBlockScreens"], defaults?.preBlock),
    postBlock: pickFirstScreens(["postBlockPages", "afterBlockPages", "afterBlockScreens"], defaults?.postBlock),
    end: pickFirstScreens(["endPages", "outroPages", "end", "outro"], defaults?.end),
  };
}

export interface InstructionScreenSlots {
  intro: InstructionScreenSpec[];
  preBlock: InstructionScreenSpec[];
  postBlock: InstructionScreenSpec[];
  end: InstructionScreenSpec[];
}

export function toInstructionScreenSpecs(value: unknown): InstructionScreenSpec[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [{ text }] : [];
  }
  return asArray(value)
    .map((item): InstructionScreenSpec | null => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? { text } : null;
      }
      const raw = asObject(item);
      if (!raw) return null;
      const title = asString(raw.title) ?? undefined;
      const html = asString(raw.html) ?? undefined;
      const text = asString(raw.text) ?? asString(raw.body) ?? asString(raw.content) ?? undefined;
      if (!html && !text) return null;
      return { ...(title ? { title } : {}), ...(text ? { text } : {}), ...(html ? { html } : {}) };
    })
    .filter((item): item is InstructionScreenSpec => Boolean(item));
}

export function resolveInstructionScreenSlots(
  instructions: unknown,
  defaults?: Partial<InstructionScreenSlots>,
): InstructionScreenSlots {
  const raw = asObject(instructions);
  const hasOwn = (key: string): boolean => Boolean(raw && Object.prototype.hasOwnProperty.call(raw, key));
  const pickFirstScreens = (keys: string[], fallback?: InstructionScreenSpec[]): InstructionScreenSpec[] => {
    for (const key of keys) {
      if (!hasOwn(key)) continue;
      return toInstructionScreenSpecs(raw?.[key]);
    }
    return Array.isArray(fallback) ? [...fallback] : [];
  };
  return {
    intro: pickFirstScreens(["pages", "introPages", "intro", "screens"], defaults?.intro),
    preBlock: pickFirstScreens(["preBlockPages", "beforeBlockPages", "beforeBlockScreens"], defaults?.preBlock),
    postBlock: pickFirstScreens(["postBlockPages", "afterBlockPages", "afterBlockScreens"], defaults?.postBlock),
    end: pickFirstScreens(["endPages", "outroPages", "end", "outro"], defaults?.end),
  };
}
