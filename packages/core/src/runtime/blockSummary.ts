import { escapeHtml } from "../web/ui";

export type BlockSummaryPlacement = "block_end_before_post" | "block_end_after_post";

export interface BlockSummaryWhen {
  blockIndex?: number[];
  blockLabel?: string[];
  blockType?: string[];
  isPractice?: boolean;
}

export interface BlockSummaryMetrics {
  correctField: string;
  rtField: string;
  metricField?: string;
}

export type BlockSummaryWhereValue = string | number | boolean;

export interface BlockSummaryWhere {
  [field: string]: BlockSummaryWhereValue | BlockSummaryWhereValue[];
}

export interface BlockSummaryConfig {
  enabled: boolean;
  at: BlockSummaryPlacement;
  title: string;
  lines: string[];
  when?: BlockSummaryWhen;
  where?: BlockSummaryWhere;
  metrics: BlockSummaryMetrics;
}

export interface BlockSummaryStats {
  total?: number;
  correct?: number;
  accuracyPct?: number;
  meanRtMs?: number;
  validRtCount?: number;
  meanMetric?: number;
}

export interface BlockSummaryModel {
  at: BlockSummaryPlacement;
  title: string;
  lines: string[];
  text: string;
}

const DEFAULT_SUMMARY: BlockSummaryConfig = {
  enabled: false,
  at: "block_end_before_post",
  title: "End of {blockLabel}",
  lines: ["Accuracy: {accuracyPct}% ({correct}/{total})"],
  metrics: {
    correctField: "responseCorrect",
    rtField: "responseRtMs",
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringScreens(value: unknown): string[] {
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

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getFieldValue(record: Record<string, unknown> | null, fieldPath: string): unknown {
  if (!record) return undefined;
  const direct = record[fieldPath];
  if (direct !== undefined) return direct;
  if (!fieldPath.includes(".")) return direct;

  let cursor: unknown = record;
  let start = 0;
  let hasSegments = false;

  for (let i = 0; i <= fieldPath.length; i += 1) {
    if (i === fieldPath.length || fieldPath[i] === ".") {
      if (i > start) {
        const segment = fieldPath.substring(start, i).trim();
        if (segment.length > 0) {
          hasSegments = true;
          if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
          cursor = (cursor as Record<string, unknown>)[segment];
          if (cursor === undefined) return undefined;
        }
      }
      start = i + 1;
    }
  }
  return hasSegments ? cursor : undefined;
}

function toTextNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function normalizeWhen(raw: Record<string, unknown> | null): BlockSummaryWhen | undefined {
  if (!raw) return undefined;

  const blockIndex: number[] = [];
  const rawIndex = asArray(raw.blockIndex);
  for (let i = 0; i < rawIndex.length; i += 1) {
    const item = Number(rawIndex[i]);
    if (Number.isInteger(item)) blockIndex.push(Math.floor(item));
  }

  const blockLabel: string[] = [];
  const rawLabel = asArray(raw.blockLabel);
  for (let i = 0; i < rawLabel.length; i += 1) {
    const item = asString(rawLabel[i]);
    if (item) blockLabel.push(item);
  }

  const blockType: string[] = [];
  const rawType = asArray(raw.blockType);
  for (let i = 0; i < rawType.length; i += 1) {
    const item = asString(rawType[i]);
    if (item) blockType.push(item.toLowerCase());
  }

  const isPractice = typeof raw.isPractice === "boolean" ? raw.isPractice : undefined;
  if (blockIndex.length === 0 && blockLabel.length === 0 && blockType.length === 0 && typeof isPractice !== "boolean") {
    return undefined;
  }
  return {
    ...(blockIndex.length > 0 ? { blockIndex } : {}),
    ...(blockLabel.length > 0 ? { blockLabel } : {}),
    ...(blockType.length > 0 ? { blockType } : {}),
    ...(typeof isPractice === "boolean" ? { isPractice } : {}),
  };
}

function normalizeWhere(raw: Record<string, unknown> | null): BlockSummaryWhere | undefined {
  if (!raw) return undefined;
  const out: BlockSummaryWhere = {};
  let hasKeys = false;

  for (const field in raw) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue;

    const key = String(field || "").trim();
    if (!key) continue;

    const value = raw[field];
    if (Array.isArray(value)) {
      const validValues: BlockSummaryWhereValue[] = [];
      for (let i = 0; i < value.length; i += 1) {
        const entry = value[i];
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
          validValues.push(entry);
        }
      }
      if (validValues.length > 0) {
        out[key] = validValues;
        hasKeys = true;
      }
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      hasKeys = true;
    }
  }
  return hasKeys ? out : undefined;
}

export function coerceBlockSummaryConfig(value: unknown): BlockSummaryConfig | null {
  const raw = asObject(value);
  if (!raw) return null;
  const enabled = raw.enabled != null ? raw.enabled !== false : DEFAULT_SUMMARY.enabled;
  const atRaw = (asString(raw.at) || "").toLowerCase();
  const at: BlockSummaryPlacement =
    atRaw === "block_end_after_post" || atRaw === "after_post" ? "block_end_after_post" : "block_end_before_post";
  const lines = toStringScreens(raw.lines);
  const metrics = asObject(raw.metrics);
  return {
    enabled,
    at,
    title: asString(raw.title) || DEFAULT_SUMMARY.title,
    lines: lines.length > 0 ? lines : DEFAULT_SUMMARY.lines,
    when: normalizeWhen(asObject(raw.when)),
    where: normalizeWhere(asObject(raw.where)),
    metrics: {
      correctField: asString(metrics?.correctField) || DEFAULT_SUMMARY.metrics.correctField,
      rtField: asString(metrics?.rtField) || DEFAULT_SUMMARY.metrics.rtField,
    },
  };
}

export function mergeBlockSummaryConfig(
  base: BlockSummaryConfig | null,
  override: unknown,
): BlockSummaryConfig | null {
  const overrideRaw = asObject(override);
  if (!overrideRaw) return base;
  const mergedRaw: Record<string, unknown> = {
    ...(base ?? {}),
    ...overrideRaw,
    metrics: {
      ...(base?.metrics ?? {}),
      ...(asObject(overrideRaw.metrics) ?? {}),
    },
    when: {
      ...(base?.when ?? {}),
      ...(asObject(overrideRaw.when) ?? {}),
    },
    where: {
      ...(base?.where ?? {}),
      ...(asObject(overrideRaw.where) ?? {}),
    },
  };
  return coerceBlockSummaryConfig(mergedRaw);
}

function matchesWhen(
  when: BlockSummaryWhen | undefined,
  blockContext: { blockIndex: number; blockLabel: string; blockType: string; isPractice: boolean },
): boolean {
  if (!when) return true;
  if (Array.isArray(when.blockIndex) && when.blockIndex.length > 0 && !when.blockIndex.includes(blockContext.blockIndex)) {
    return false;
  }
  if (Array.isArray(when.blockLabel) && when.blockLabel.length > 0 && !when.blockLabel.includes(blockContext.blockLabel)) {
    return false;
  }
  if (Array.isArray(when.blockType) && when.blockType.length > 0 && !when.blockType.includes(blockContext.blockType)) {
    return false;
  }
  if (typeof when.isPractice === "boolean" && when.isPractice !== blockContext.isPractice) {
    return false;
  }
  return true;
}

export function computeBlockSummaryStats(args: {
  trialResults: unknown[];
  where?: BlockSummaryWhere;
  metrics: BlockSummaryMetrics;
}): { total: number; correct: number; accuracyPct: number; meanRtMs: number; validRtCount: number; meanMetric: number } {
  const { trialResults, where, metrics } = args;
  const rows = Array.isArray(trialResults) ? trialResults : [];

  // ⚡ Bolt: Hoist Object.entries and Set creation outside the filter loop
  // to avoid redundant O(N) allocations for every trial row.
  let whereEntries: Array<[string, Set<string>]> | null = null;
  if (where) {
    whereEntries = Object.entries(where).map(([field, expectedRaw]) => {
      const expectedArray = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
      return [field, new Set(expectedArray.map(String))];
    });
  }

  const filteredRows: unknown[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!whereEntries) {
      filteredRows.push(row);
      continue;
    }
    const record = asObject(row);
    if (!record) continue;

    let isMatch = true;
    for (let j = 0; j < whereEntries.length; j += 1) {
      const entry = whereEntries[j];
      const actual = getFieldValue(record, entry[0]);
      if (!entry[1].has(String(actual))) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) filteredRows.push(row);
  }

  let total = 0;
  let correct = 0;
  let rtSum = 0;
  let validRtCount = 0;
  let metricSum = 0;
  let validMetricCount = 0;
  for (const row of filteredRows) {
    const record = asObject(row);
    const correctRaw = getFieldValue(record, metrics.correctField);
    if (Array.isArray(correctRaw)) {
      for (const value of correctRaw) {
        if (value === null || value === undefined) continue;
        total += 1;
        if (value === true || Number(value) === 1) correct += 1;
      }
    } else {
      total += 1;
      if (correctRaw === true || Number(correctRaw) === 1) correct += 1;
    }
    const rtRaw = getFieldValue(record, metrics.rtField);
    const rt = toFiniteNumber(rtRaw);
    if (rt != null && rt >= 0) {
      rtSum += rt;
      validRtCount += 1;
    }
    if (metrics.metricField) {
      const metricRaw = getFieldValue(record, metrics.metricField);
      if (Array.isArray(metricRaw)) {
        for (const val of metricRaw) {
          const metricValue = toFiniteNumber(val);
          if (metricValue != null) {
            metricSum += Math.abs(metricValue);
            validMetricCount += 1;
          }
        }
      } else {
        const metricValue = toFiniteNumber(metricRaw);
        if (metricValue != null) {
          metricSum += Math.abs(metricValue);
          validMetricCount += 1;
        }
      }
    }
  }
  const accuracyPct = total > 0 ? (correct / total) * 100 : 0;
  const meanRtMs = validRtCount > 0 ? rtSum / validRtCount : 0;
  const meanMetric = validMetricCount > 0 ? metricSum / validMetricCount : 0;
  return { total, correct, accuracyPct, meanRtMs, validRtCount, meanMetric };
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => vars[key] ?? "");
}

export function buildBlockSummaryModel(args: {
  config: BlockSummaryConfig | null;
  block: unknown;
  blockIndex: number;
  trialResults?: unknown[];
  fallbackStats?: BlockSummaryStats;
}): BlockSummaryModel | null {
  const cfg = args.config;
  if (!cfg || !cfg.enabled) return null;

  const block = asObject(args.block);
  const blockLabel = asString(block?.label) || `Block ${args.blockIndex + 1}`;
  const blockType = (asString(block?.blockType) || "").toLowerCase();
  const isPractice = Boolean(block?.isPractice);
  if (!matchesWhen(cfg.when, { blockIndex: args.blockIndex, blockLabel, blockType, isPractice })) return null;

  const fromTrials = computeBlockSummaryStats({
    trialResults: args.trialResults ?? [],
    where: cfg.where,
    metrics: cfg.metrics,
  });
  const total = fromTrials.total > 0 ? fromTrials.total : Math.max(0, Math.floor(args.fallbackStats?.total ?? 0));
  const correct = fromTrials.total > 0 ? fromTrials.correct : Math.max(0, Math.floor(args.fallbackStats?.correct ?? 0));
  const incorrect = Math.max(0, total - correct);
  const accuracyPct = fromTrials.total > 0
    ? fromTrials.accuracyPct
    : (Number.isFinite(Number(args.fallbackStats?.accuracyPct)) ? Number(args.fallbackStats?.accuracyPct) : (total > 0 ? (correct / total) * 100 : 0));
  const validRtCount = fromTrials.validRtCount > 0 ? fromTrials.validRtCount : Math.max(0, Math.floor(args.fallbackStats?.validRtCount ?? 0));
  const meanRtMs = fromTrials.validRtCount > 0
    ? fromTrials.meanRtMs
    : (Number.isFinite(Number(args.fallbackStats?.meanRtMs)) ? Number(args.fallbackStats?.meanRtMs) : 0);

  const latestRecord = asObject((args.trialResults ?? [])[Math.max(0, (args.trialResults ?? []).length - 1)]);
  const latestScopeTotals = asObject(latestRecord?.stats_scope_totals);
  const latestBlockTotals = asObject(latestScopeTotals?.block);
  const latestExperimentTotals = asObject(latestScopeTotals?.experiment);
  const pickTotal = (source: Record<string, unknown> | null, key: string, fallback = 0): number => {
    const direct = toFiniteNumber(source?.[key]);
    if (direct != null) return Math.max(0, direct);
    return Math.max(0, fallback);
  };

  const blockSpawned = pickTotal(latestBlockTotals, "spawned", 0);
  const blockCleared = pickTotal(latestBlockTotals, "cleared", 0);
  const blockDropped = pickTotal(latestBlockTotals, "dropped", 0);
  const blockPoints = pickTotal(latestBlockTotals, "points", 0);
  const experimentSpawned = pickTotal(latestExperimentTotals, "spawned", blockSpawned);
  const experimentCleared = pickTotal(latestExperimentTotals, "cleared", blockCleared);
  const experimentDropped = pickTotal(latestExperimentTotals, "dropped", blockDropped);
  const experimentPoints = pickTotal(latestExperimentTotals, "points", blockPoints);

  const vars: Record<string, string> = {
    blockLabel,
    blockIndex: String(args.blockIndex),
    blockIndex1: String(args.blockIndex + 1),
    blockType,
    isPractice: isPractice ? "1" : "0",
    total: String(total),
    correct: String(correct),
    incorrect: String(incorrect),
    accuracyPct: toTextNumber(accuracyPct, 1),
    meanRtMs: toTextNumber(meanRtMs, 1),
    validRtCount: String(validRtCount),
    blockSpawned: toTextNumber(blockSpawned, 0),
    blockCleared: toTextNumber(blockCleared, 0),
    blockDropped: toTextNumber(blockDropped, 0),
    blockPoints: toTextNumber(blockPoints, 0),
    experimentSpawned: toTextNumber(experimentSpawned, 0),
    experimentCleared: toTextNumber(experimentCleared, 0),
    experimentDropped: toTextNumber(experimentDropped, 0),
    experimentPoints: toTextNumber(experimentPoints, 0),
  };

  const title = applyTemplate(cfg.title, vars);
  const lines = cfg.lines.map((line) => applyTemplate(line, vars));
  const text = [title, ...lines].filter((line) => line.trim().length > 0).join("\n");
  if (!text) return null;
  return { at: cfg.at, title, lines, text };
}

export function renderBlockSummaryCardHtml(model: BlockSummaryModel): string {
  const title = model.title.trim() ? `<h3>${escapeHtml(model.title)}</h3>` : "";
  const body = model.lines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return `${title}${body}`;
}
