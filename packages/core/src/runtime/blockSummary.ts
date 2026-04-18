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

export interface BlockSummaryLineConfig {
  text: string;
  where?: BlockSummaryWhere;
  metrics?: Partial<BlockSummaryMetrics>;
}

export interface BlockSummaryConfig {
  enabled: boolean;
  at: BlockSummaryPlacement;
  title: string;
  lines: BlockSummaryLineConfig[];
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
  lines: [{ text: "Accuracy: {accuracyPct}% ({correct}/{total})" }],
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
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeMetrics(raw: Record<string, unknown> | null): Partial<BlockSummaryMetrics> | undefined {
  if (!raw) return undefined;
  const correctField = asString(raw.correctField) || undefined;
  const rtField = asString(raw.rtField) || undefined;
  const metricField = asString(raw.metricField) || undefined;
  if (!correctField && !rtField && !metricField) return undefined;
  return {
    ...(correctField ? { correctField } : {}),
    ...(rtField ? { rtField } : {}),
    ...(metricField ? { metricField } : {}),
  };
}

function normalizeLine(value: unknown): BlockSummaryLineConfig | null {
  const textFromString = asString(value);
  if (textFromString) return { text: textFromString };

  const raw = asObject(value);
  if (!raw) return null;
  const text = asString(raw.text) || asString(raw.template) || asString(raw.line);
  if (!text) return null;
  const where = normalizeWhere(asObject(raw.where));
  const metrics = normalizeMetrics(asObject(raw.metrics));
  return {
    text,
    ...(where ? { where } : {}),
    ...(metrics ? { metrics } : {}),
  };
}

function normalizeLines(value: unknown): BlockSummaryLineConfig[] {
  const fromStrings = toStringScreens(value).map((text) => ({ text }));
  if (fromStrings.length > 0) return fromStrings;
  const rawArray = asArray(value);
  const parsed = rawArray
    .map((entry) => normalizeLine(entry))
    .filter((entry): entry is BlockSummaryLineConfig => entry !== null);
  return parsed;
}

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileWhereMatcher(values: BlockSummaryWhereValue[]): { exact: Set<string>; patterns: RegExp[] } {
  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      exact.add(String(value));
      continue;
    }
    const raw = value.trim();
    if (!raw) {
      exact.add("");
      continue;
    }
    if (raw.startsWith("regex:")) {
      const pattern = raw.slice("regex:".length).trim();
      if (!pattern) continue;
      try {
        patterns.push(new RegExp(pattern));
      } catch {
        exact.add(raw);
      }
      continue;
    }
    if (raw.includes("*")) {
      const regexSource = `^${escapeRegexLiteral(raw).replace(/\\\*/g, ".*")}$`;
      try {
        patterns.push(new RegExp(regexSource));
      } catch {
        exact.add(raw);
      }
      continue;
    }
    exact.add(raw);
  }
  return { exact, patterns };
}

function getFieldValue(record: Record<string, unknown> | null, fieldPath: string): unknown {
  if (!record) return undefined;
  const direct = record[fieldPath];
  if (direct !== undefined) return direct;
  if (!fieldPath.includes(".")) return direct;
  const segments = fieldPath.split(".").map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  if (segments.length === 0) return undefined;
  let cursor: unknown = record;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

function toTextNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

function normalizeWhen(raw: Record<string, unknown> | null): BlockSummaryWhen | undefined {
  if (!raw) return undefined;
  const blockIndex = asArray(raw.blockIndex)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item))
    .map((item) => Math.floor(item));
  const blockLabel = asArray(raw.blockLabel)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
  const blockType = asArray(raw.blockType)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());
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
  for (const [field, value] of Object.entries(raw)) {
    const key = String(field || "").trim();
    if (!key) continue;
    const values = asArray(value)
      .map((entry) => {
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") return entry;
        return null;
      })
      .filter((entry): entry is BlockSummaryWhereValue => entry !== null);
    if (values.length > 0) {
      out[key] = values;
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function coerceBlockSummaryConfig(value: unknown): BlockSummaryConfig | null {
  const raw = asObject(value);
  if (!raw) return null;
  const enabled = raw.enabled != null ? raw.enabled !== false : DEFAULT_SUMMARY.enabled;
  const atRaw = (asString(raw.at) || "").toLowerCase();
  const at: BlockSummaryPlacement =
    atRaw === "block_end_after_post" || atRaw === "after_post" ? "block_end_after_post" : "block_end_before_post";
  const lines = normalizeLines(raw.lines);
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
      metricField: asString(metrics?.metricField) || undefined,
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

function combineWhere(base?: BlockSummaryWhere, extra?: BlockSummaryWhere): BlockSummaryWhere | undefined {
  if (!base && !extra) return undefined;
  if (!base) return extra;
  if (!extra) return base;

  const merged: BlockSummaryWhere = { ...base };
  for (const [field, extraValue] of Object.entries(extra)) {
    const baseValue = merged[field];
    if (baseValue === undefined) {
      merged[field] = extraValue;
      continue;
    }
    const baseValues = Array.isArray(baseValue) ? baseValue : [baseValue];
    const extraValues = Array.isArray(extraValue) ? extraValue : [extraValue];
    const extraSet = new Set(extraValues.map(String));
    const intersection = baseValues.filter((value) => extraSet.has(String(value)));
    merged[field] = intersection;
  }
  return merged;
}

function toStatsVars(args: {
  total: number;
  correct: number;
  accuracyPct: number;
  meanRtMs: number;
  validRtCount: number;
}): Record<string, string> {
  const incorrect = Math.max(0, args.total - args.correct);
  return {
    total: String(args.total),
    correct: String(args.correct),
    incorrect: String(incorrect),
    accuracyPct: toTextNumber(args.accuracyPct, 1),
    meanRtMs: toTextNumber(args.meanRtMs, 1),
    validRtCount: String(args.validRtCount),
  };
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
  let whereEntries: Array<[string, { exact: Set<string>; patterns: RegExp[] }]> | null = null;
  if (where) {
    whereEntries = Object.entries(where).map(([field, expectedRaw]) => {
      const expectedArray = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
      return [field, compileWhereMatcher(expectedArray)];
    });
  }

  const filteredRows = rows.filter((row) => {
    if (!whereEntries) return true;
    const record = asObject(row);
    if (!record) return false;
    for (const [field, matcher] of whereEntries) {
      const actual = getFieldValue(record, field);
      const actualString = String(actual);
      if (matcher.exact.has(actualString)) continue;
      if (matcher.patterns.some((pattern) => pattern.test(actualString))) continue;
      return false;
    }
    return true;
  });
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

  const baseVars: Record<string, string> = {
    blockLabel,
    blockIndex: String(args.blockIndex),
    blockIndex1: String(args.blockIndex + 1),
    blockType,
    isPractice: isPractice ? "1" : "0",
    blockSpawned: toTextNumber(blockSpawned, 0),
    blockCleared: toTextNumber(blockCleared, 0),
    blockDropped: toTextNumber(blockDropped, 0),
    blockPoints: toTextNumber(blockPoints, 0),
    experimentSpawned: toTextNumber(experimentSpawned, 0),
    experimentCleared: toTextNumber(experimentCleared, 0),
    experimentDropped: toTextNumber(experimentDropped, 0),
    experimentPoints: toTextNumber(experimentPoints, 0),
  };
  const globalVars = {
    ...baseVars,
    ...toStatsVars({
      total,
      correct,
      accuracyPct,
      meanRtMs,
      validRtCount,
    }),
  };
  const title = applyTemplate(cfg.title, globalVars);
  const lines = cfg.lines.map((lineCfg) => {
    const lineWhere = combineWhere(cfg.where, lineCfg.where);
    const lineMetrics: BlockSummaryMetrics = {
      ...cfg.metrics,
      ...(lineCfg.metrics ?? {}),
    };
    const lineStats = computeBlockSummaryStats({
      trialResults: args.trialResults ?? [],
      where: lineWhere,
      metrics: lineMetrics,
    });
    const lineVars = {
      ...globalVars,
      ...toStatsVars({
        total: lineStats.total,
        correct: lineStats.correct,
        accuracyPct: lineStats.accuracyPct,
        meanRtMs: lineStats.meanRtMs,
        validRtCount: lineStats.validRtCount,
      }),
    };
    return applyTemplate(lineCfg.text, lineVars);
  });
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
