export type BricksStatMetric = "spawned" | "cleared" | "dropped" | "points";
export type BricksStatScope = "trial" | "block" | "experiment";
export type BricksResetAt = "block_start" | "block_end";

export interface BricksBlockMeta {
  label: string;
  manipulationId?: string | null;
  phase?: string | null;
  isPractice?: boolean;
}

export interface BricksStatsPresentationRule {
  scope?: BricksStatScope;
  metrics?: BricksStatMetric[];
  at?: BricksResetAt;
  when?: {
    isPractice?: boolean;
    phaseIn?: string[];
    labelIn?: string[];
    manipulationIdIn?: string[];
  };
}

export interface BricksStatsPresentationConfig {
  defaultScope: BricksStatScope;
  scopeByMetric: Record<BricksStatMetric, BricksStatScope>;
  resetRules: BricksStatsPresentationRule[];
}

export interface BricksStatsAccumulator {
  block: Record<BricksStatMetric, number>;
  experiment: Record<BricksStatMetric, number>;
}

const METRICS: BricksStatMetric[] = ["spawned", "cleared", "dropped", "points"];
const SCOPES = new Set<BricksStatScope>(["trial", "block", "experiment"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeScope(value: unknown, fallback: BricksStatScope): BricksStatScope {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SCOPES.has(candidate as BricksStatScope) ? (candidate as BricksStatScope) : fallback;
}

function normalizeMetricList(value: unknown): BricksStatMetric[] {
  const items = asStringArray(value);
  if (items.length === 0) return METRICS.slice();
  const selected = items.filter((item): item is BricksStatMetric => METRICS.includes(item as BricksStatMetric));
  return selected.length > 0 ? selected : METRICS.slice();
}

function emptyStats(): Record<BricksStatMetric, number> {
  return { spawned: 0, cleared: 0, dropped: 0, points: 0 };
}

function normalizeResetRule(value: unknown): BricksStatsPresentationRule | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const when = asRecord(raw.when);
  const atRaw = typeof raw.at === "string" ? raw.at.trim().toLowerCase() : "block_end";
  const at: BricksResetAt = atRaw === "block_start" ? "block_start" : "block_end";
  const scope = normalizeScope(raw.scope, "experiment");
  return {
    scope,
    metrics: normalizeMetricList(raw.metrics),
    at,
    when: {
      isPractice: typeof when?.isPractice === "boolean" ? when.isPractice : undefined,
      phaseIn: asStringArray(when?.phaseIn),
      labelIn: asStringArray(when?.labelIn),
      manipulationIdIn: asStringArray(when?.manipulationIdIn),
    },
  };
}

export function resolveBricksStatsPresentation(config: unknown): BricksStatsPresentationConfig {
  const root = asRecord(config);
  const experiment = asRecord(root?.experiment);
  const raw = asRecord(experiment?.statsPresentation);
  const defaultScope = normalizeScope(raw?.defaultScope, "trial");
  const scopeByMetricRaw = asRecord(raw?.scopeByMetric);
  const scopeByMetric: Record<BricksStatMetric, BricksStatScope> = {
    spawned: normalizeScope(scopeByMetricRaw?.spawned, defaultScope),
    cleared: normalizeScope(scopeByMetricRaw?.cleared, defaultScope),
    dropped: normalizeScope(scopeByMetricRaw?.dropped, defaultScope),
    points: normalizeScope(scopeByMetricRaw?.points, defaultScope),
  };
  const resetRules = Array.isArray(raw?.reset)
    ? raw.reset.map(normalizeResetRule).filter((rule): rule is BricksStatsPresentationRule => Boolean(rule))
    : [];

  return { defaultScope, scopeByMetric, resetRules };
}

function ruleMatchesBlock(rule: BricksStatsPresentationRule, block: BricksBlockMeta): boolean {
  const when = rule.when;
  if (!when) return true;
  if (typeof when.isPractice === "boolean" && Boolean(block.isPractice) !== when.isPractice) return false;
  if (when.phaseIn && when.phaseIn.length > 0) {
    const phase = String(block.phase ?? "").trim();
    if (!phase || !when.phaseIn.includes(phase)) return false;
  }
  if (when.labelIn && when.labelIn.length > 0) {
    if (!block.label || !when.labelIn.includes(block.label)) return false;
  }
  if (when.manipulationIdIn && when.manipulationIdIn.length > 0) {
    const manipulationId = String(block.manipulationId ?? "").trim();
    if (!manipulationId || !when.manipulationIdIn.includes(manipulationId)) return false;
  }
  return true;
}

export function createBricksStatsAccumulator(): BricksStatsAccumulator {
  return {
    block: emptyStats(),
    experiment: emptyStats(),
  };
}

export function resetAccumulatorScope(
  accumulator: BricksStatsAccumulator,
  scope: BricksStatScope,
  metrics?: BricksStatMetric[],
): void {
  if (scope === "trial") return;
  const target = scope === "block" ? accumulator.block : accumulator.experiment;
  const metricList = metrics && metrics.length > 0 ? metrics : METRICS;
  for (const metric of metricList) {
    target[metric] = 0;
  }
}

export function applyResetRulesAt(
  accumulator: BricksStatsAccumulator,
  presentation: BricksStatsPresentationConfig,
  at: BricksResetAt,
  block: BricksBlockMeta,
): void {
  presentation.resetRules.forEach((rule) => {
    if ((rule.at ?? "block_end") !== at) return;
    if (!ruleMatchesBlock(rule, block)) return;
    resetAccumulatorScope(accumulator, rule.scope ?? "experiment", rule.metrics);
  });
}

export function buildHudBaseStats(
  accumulator: BricksStatsAccumulator,
  presentation: BricksStatsPresentationConfig,
): Record<BricksStatMetric, number> {
  const out = emptyStats();
  METRICS.forEach((metric) => {
    const scope = presentation.scopeByMetric[metric] ?? presentation.defaultScope;
    out[metric] = scope === "block" ? accumulator.block[metric] : scope === "experiment" ? accumulator.experiment[metric] : 0;
  });
  return out;
}

export function addTrialStatsToAccumulator(
  accumulator: BricksStatsAccumulator,
  trialStats: Record<string, unknown> | null | undefined,
): void {
  METRICS.forEach((metric) => {
    const value = Number(trialStats?.[metric] ?? 0);
    if (!Number.isFinite(value)) return;
    accumulator.block[metric] += value;
    accumulator.experiment[metric] += value;
  });
}

