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

/** Like toPositiveNumber but preserves decimal precision (no Math.floor). */
export function toPositiveFloat(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
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
  const out: number[] = [];
  const arrayValue = asArray(value);
  for (let i = 0; i < arrayValue.length; i += 1) {
    const entry = Number(arrayValue[i]);
    if (Number.isFinite(entry)) out.push(entry);
  }
  return out.length > 0 ? out : fallback;
}

export function toStringScreens(value: unknown): string[] {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? [text] : [];
  }
  const out: string[] = [];
  const arrayValue = asArray(value);
  for (let i = 0; i < arrayValue.length; i += 1) {
    const item = asString(arrayValue[i]);
    if (item) out.push(item);
  }
  return out;
}

export type BlockScreenSlot = "before" | "after" | "repeatAfter";

const BLOCK_SCREEN_SLOT_KEYS: Record<BlockScreenSlot, string[]> = {
  before: ["beforeBlockScreens", "preBlockScreens", "preBlockInstructions"],
  after: ["afterBlockScreens", "postBlockScreens", "postBlockInstructions"],
  repeatAfter: ["repeatAfterBlockScreens", "repeatPostBlockScreens"],
};

export function resolveBlockScreenSlotValue(
  block: Record<string, unknown> | null | undefined,
  slot: BlockScreenSlot,
): unknown {
  const source = block ?? null;
  if (!source) return undefined;
  const keys = BLOCK_SCREEN_SLOT_KEYS[slot];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

export function asStringArray(value: unknown, fallback: string[]): string[] {
  const out: string[] = [];
  const arrayValue = asArray(value);
  for (let i = 0; i < arrayValue.length; i += 1) {
    const item = asString(arrayValue[i]);
    if (item) out.push(item);
  }
  return out.length > 0 ? out : [...fallback];
}

export function asPositiveNumberArray(value: unknown, fallback: number[]): number[] {
  const out: number[] = [];
  const arrayValue = asArray(value);
  for (let i = 0; i < arrayValue.length; i += 1) {
    const entry = Number(arrayValue[i]);
    if (Number.isFinite(entry) && entry > 0) {
      out.push(Math.floor(entry));
    }
  }
  return out.length > 0 ? out : [...fallback];
}

export type InstructionInsertionPoint =
  | "task_intro_before"
  | "task_intro_after"
  | "block_start_before_intro"
  | "block_start_after_intro"
  | "block_start_after_pre"
  | "block_end_before_post"
  | "block_end_after_post"
  | "task_end_before"
  | "task_end_after";

export interface InstructionInsertionWhen {
  blockIndex?: number[];
  blockLabel?: string[];
  blockType?: string[];
  isPractice?: boolean;
}

export interface InstructionInsertion {
  id?: string;
  at: InstructionInsertionPoint;
  pages: InstructionScreenSpec[];
  when?: InstructionInsertionWhen;
}

const INSTRUCTION_INSERTION_POINTS = new Set<InstructionInsertionPoint>([
  "task_intro_before",
  "task_intro_after",
  "block_start_before_intro",
  "block_start_after_intro",
  "block_start_after_pre",
  "block_end_before_post",
  "block_end_after_post",
  "task_end_before",
  "task_end_after",
]);

export function coerceInstructionInsertions(value: unknown): InstructionInsertion[] {
  const out: InstructionInsertion[] = [];
  for (const entry of asArray(value)) {
    const raw = asObject(entry);
    if (!raw) continue;
    const rawPoint = asString(raw.at) ?? asString(raw.point) ?? asString(raw.target);
    if (!rawPoint) continue;
    const at = rawPoint.toLowerCase() as InstructionInsertionPoint;
    if (!INSTRUCTION_INSERTION_POINTS.has(at)) continue;
    const pages = toInstructionScreenSpecs(raw.pages);
    if (pages.length === 0) continue;
    const whenRaw = asObject(raw.when);

    const blockIndex: number[] = [];
    const rawBlockIndex = asArray(whenRaw?.blockIndex);
    for (let i = 0; i < rawBlockIndex.length; i += 1) {
      const item = Number(rawBlockIndex[i]);
      if (Number.isInteger(item)) {
        blockIndex.push(Math.floor(item));
      }
    }

    const blockLabel: string[] = [];
    const rawBlockLabel = asArray(whenRaw?.blockLabel);
    for (let i = 0; i < rawBlockLabel.length; i += 1) {
      const item = asString(rawBlockLabel[i]);
      if (item) blockLabel.push(item);
    }

    const blockType: string[] = [];
    const rawBlockType = asArray(whenRaw?.blockType);
    for (let i = 0; i < rawBlockType.length; i += 1) {
      const item = asString(rawBlockType[i]);
      if (item) blockType.push(item.toLowerCase());
    }
    const isPractice = typeof whenRaw?.isPractice === "boolean" ? whenRaw.isPractice : undefined;
    const when: InstructionInsertionWhen | undefined =
      blockIndex.length > 0 || blockLabel.length > 0 || blockType.length > 0 || typeof isPractice === "boolean"
        ? {
            ...(blockIndex.length > 0 ? { blockIndex } : {}),
            ...(blockLabel.length > 0 ? { blockLabel } : {}),
            ...(blockType.length > 0 ? { blockType } : {}),
            ...(typeof isPractice === "boolean" ? { isPractice } : {}),
          }
        : undefined;
    out.push({
      ...(asString(raw.id) ? { id: asString(raw.id) as string } : {}),
      at,
      pages,
      ...(when ? { when } : {}),
    });
  }
  return out;
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
  actions?: InstructionScreenAction[];
}

export interface InstructionScreenAction {
  id?: string;
  label: string;
  action?: "continue" | "exit";
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
  const out: InstructionScreenSpec[] = [];
  const arrayValue = asArray(value);
  for (let i = 0; i < arrayValue.length; i += 1) {
    const item = arrayValue[i];
    if (typeof item === "string") {
      const text = item.trim();
      if (text) out.push({ text });
      continue;
    }
    const raw = asObject(item);
    if (!raw) continue;
    const title = asString(raw.title) ?? undefined;
    const html = asString(raw.html) ?? undefined;
    const text = asString(raw.text) ?? asString(raw.body) ?? asString(raw.content) ?? undefined;

    const actions: InstructionScreenAction[] = [];
    const rawActions = asArray(raw.actions);
    for (let j = 0; j < rawActions.length; j += 1) {
      const entry = rawActions[j];
      const actionRaw = asObject(entry);
      if (!actionRaw) continue;
      const label = asString(actionRaw.label);
      if (!label) continue;
      const action = (asString(actionRaw.action) ?? "continue").toLowerCase();
      actions.push({
        ...(asString(actionRaw.id) ? { id: asString(actionRaw.id) as string } : {}),
        label,
        action: action === "exit" ? "exit" : "continue",
      });
    }

    if (!html && !text) continue;
    out.push({
      ...(title ? { title } : {}),
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      ...(actions.length > 0 ? { actions } : {}),
    });
  }
  return out;
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
