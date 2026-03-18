import { computeBlockSummaryStats, type BlockSummaryWhere } from "./blockSummary";

export interface BlockRepeatMetricSpec {
  correctField: string;
  metricField?: string;
}

export interface BlockRepeatUntilConfig {
  enabled: boolean;
  maxAttempts: number;
  minAccuracy?: number;
  minCorrect?: number;
  minTotal?: number;
  maxMeanMetric?: number;
  minMeanMetric?: number;
  where?: BlockSummaryWhere;
  metrics: BlockRepeatMetricSpec;
}

export interface BlockRepeatEvaluation {
  enabled: boolean;
  maxAttempts: number;
  attemptIndex: number;
  passed: boolean;
  shouldRepeat: boolean;
  reason: "disabled" | "max_attempts_reached" | "threshold_not_met" | "threshold_met";
  stats: {
    total: number;
    correct: number;
    accuracy: number;
    meanMetric?: number;
  };
}

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

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
      .filter((entry): entry is string | number | boolean => entry !== null);
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

function normalizeMinAccuracy(raw: unknown): number | undefined {
  const numeric = toNumber(raw);
  if (numeric == null) return undefined;
  if (numeric > 1) return Math.min(1, Math.max(0, numeric / 100));
  return Math.min(1, Math.max(0, numeric));
}

export function coerceBlockRepeatUntilConfig(value: unknown): BlockRepeatUntilConfig | null {
  const raw = asObject(value);
  if (!raw) return null;
  const metricsRaw = asObject(raw.metrics);
  const maxAttempts = Math.max(1, Math.floor(toNumber(raw.maxAttempts) ?? 1));
  const minCorrect = toNumber(raw.minCorrect);
  const minTotal = toNumber(raw.minTotal);
  return {
    enabled: raw.enabled !== false,
    maxAttempts,
    minAccuracy: normalizeMinAccuracy(raw.minAccuracy ?? raw.minAccuracyPct),
    minCorrect: minCorrect != null ? Math.max(0, Math.floor(minCorrect)) : undefined,
    minTotal: minTotal != null ? Math.max(0, Math.floor(minTotal)) : undefined,
    where: normalizeWhere(asObject(raw.where)),
    metrics: {
      correctField: asString(metricsRaw?.correctField) || "correct",
    },
  };
}

export function evaluateBlockRepeatUntil(args: {
  config: BlockRepeatUntilConfig | null;
  trialResults: unknown[];
  attemptIndex: number;
}): BlockRepeatEvaluation {
  const cfg = args.config;
  const fallback: BlockRepeatEvaluation = {
    enabled: false,
    maxAttempts: 1,
    attemptIndex: args.attemptIndex,
    passed: true,
    shouldRepeat: false,
    reason: "disabled",
    stats: { total: 0, correct: 0, accuracy: 0, meanMetric: 0 },
  };
  if (!cfg || !cfg.enabled) return fallback;

  const stats = computeBlockSummaryStats({
    trialResults: args.trialResults,
    where: cfg.where,
    metrics: {
      correctField: cfg.metrics.correctField,
      rtField: "rt",
      metricField: cfg.metrics.metricField,
    },
  });
  const accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
  const thresholdChecks: boolean[] = [];
  if (typeof cfg.minAccuracy === "number") thresholdChecks.push(accuracy >= cfg.minAccuracy);
  if (typeof cfg.minCorrect === "number") thresholdChecks.push(stats.correct >= cfg.minCorrect);
  if (typeof cfg.minTotal === "number") thresholdChecks.push(stats.total >= cfg.minTotal);
  if (typeof cfg.maxMeanMetric === "number") thresholdChecks.push(stats.meanMetric <= cfg.maxMeanMetric);
  if (typeof cfg.minMeanMetric === "number") thresholdChecks.push(stats.meanMetric >= cfg.minMeanMetric);
  const passed = thresholdChecks.length > 0 ? thresholdChecks.every(Boolean) : true;
  const maxAttemptsReached = args.attemptIndex + 1 >= cfg.maxAttempts;
  const shouldRepeat = !passed && !maxAttemptsReached;
  const reason: BlockRepeatEvaluation["reason"] = passed
    ? "threshold_met"
    : maxAttemptsReached
      ? "max_attempts_reached"
      : "threshold_not_met";
  return {
    enabled: cfg.enabled,
    maxAttempts: cfg.maxAttempts,
    attemptIndex: args.attemptIndex,
    passed,
    shouldRepeat,
    reason,
    stats: {
      total: stats.total,
      correct: stats.correct,
      accuracy,
      meanMetric: stats.meanMetric,
    },
  };
}
