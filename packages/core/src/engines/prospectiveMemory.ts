import { SeededRandom } from "../infrastructure/random";
import type { TaskModule, TaskModuleHandle, TaskModuleAddress, TaskModuleContext } from "../api/taskModule";

export interface ProspectiveMemoryScheduleConfig {
  count: number;
  minSeparation: number;
  maxSeparation: number;
}

export interface ProspectiveMemoryCueContext {
  category?: string | null;
  stimulusText?: string | null;
  stimulusColor?: string | null;
  flags?: Record<string, unknown>;
}

export type ProspectiveMemoryCueRule =
  | { type: "category_in"; categories: string[]; responseKey: string; id?: string }
  | { type: "text_starts_with"; prefixes: string[]; responseKey: string; caseSensitive?: boolean; id?: string }
  | { type: "stimulus_color"; colors: string[]; responseKey: string; caseSensitive?: boolean; id?: string }
  | { type: "flag_equals"; flag: string; value: string | number | boolean | null; responseKey: string; id?: string };

export interface ProspectiveMemoryCueMatch {
  matched: boolean;
  responseKey: string | null;
  ruleId: string | null;
}

export interface ProspectiveMemoryModuleConfig {
  enabled: boolean;
  schedule: ProspectiveMemoryScheduleConfig;
  rules: ProspectiveMemoryCueRule[];
  eligibleTrialTypes?: string[];
  captureResponses?: boolean;
}

export interface ProspectiveMemoryModuleResult {
  responses: Array<{ key: string; timestamp: number }>;
}

export class ProspectiveMemoryModule implements TaskModule<ProspectiveMemoryModuleConfig, ProspectiveMemoryModuleResult> {
  readonly id = "pm";

  transformBlockPlan(block: any, config: ProspectiveMemoryModuleConfig, context: TaskModuleContext): any {
    if (!config.enabled || !context.rng || !context.stimuliByCategory) return block;

    const trials = Array.isArray(block.trials) ? block.trials : [];
    const eligibleIndices = trials
      .map((t: any, idx: number) => ({ type: t.trialType, idx }))
      .filter((t: any) => !config.eligibleTrialTypes || config.eligibleTrialTypes.includes(t.type))
      .map((t: any) => t.idx);

    if (eligibleIndices.length === 0) return block;

    const pmPositions = generateProspectiveMemoryPositions(context.rng!, trials.length, config.schedule, new Set(eligibleIndices));
    
    const newTrials = [...trials];
    for (const pos of pmPositions) {
      // Pick a rule and an item
      const ruleIndex = context.rng!.int(0, config.rules.length - 1);
      const rule = config.rules[ruleIndex];
      
      let pmItem = "pm_item";
      let sourceCategory = "unknown";

      if (rule.type === "category_in" && rule.categories.length > 0) {
        const catIndex = context.rng!.int(0, rule.categories.length - 1);
        const category = rule.categories[catIndex];
        const pool = context.stimuliByCategory![category];
        if (pool && pool.length > 0) {
          pmItem = pool[context.rng!.int(0, pool.length - 1)];
          sourceCategory = category;
        }
      }

      newTrials[pos] = {
        ...newTrials[pos],
        trialType: "PM",
        item: pmItem,
        sourceCategory,
        correctResponse: rule.responseKey,
        itemCategory: "PM",
      };
    }

    return { ...block, trials: newTrials };
  }

  getModularSemantics(config: ProspectiveMemoryModuleConfig): Record<string, string | string[]> {
    if (!config.enabled) return {};
    const keys = Array.from(new Set(config.rules.map((r) => r.responseKey))).filter(Boolean);
    if (keys.length === 0) return {};
    return { pm: keys };
  }

  start(_config: ProspectiveMemoryModuleConfig, _address: TaskModuleAddress, _context: TaskModuleContext): TaskModuleHandle<ProspectiveMemoryModuleResult> {
    return {
      stop: () => ({
        responses: [],
      }),
    };
  }
}

export function generateProspectiveMemoryPositions(
  rng: SeededRandom,
  nTrials: number,
  schedule: ProspectiveMemoryScheduleConfig,
  eligibleIndices?: Set<number>,
): number[] {
  const nPm = Math.max(0, Math.floor(schedule.count));
  const minSep = Math.max(1, Math.floor(schedule.minSeparation));
  const maxSep = Math.max(minSep, Math.floor(schedule.maxSeparation));
  if (nPm <= 0) return [];

  const positions: number[] = [];
  // Match legacy PM semantics: first PM is constrained by minSeparation from trial 0.
  let lastPos = 0;

  for (let i = 0; i < nPm; i += 1) {
    const remaining = nPm - i - 1;
    const minPos = lastPos + minSep;
    const latestByMaxGap = lastPos + maxSep;
    const latestByRemaining = nTrials - 1 - remaining * minSep;
    const maxPos = Math.min(latestByMaxGap, latestByRemaining);

    if (minPos > maxPos) {
      throw new Error(`Cannot place PM trial ${i + 1}/${nPm}: spacing constraints impossible.`);
    }

    const possiblePos: number[] = [];
    for (let p = minPos; p <= maxPos; p++) {
      if (!eligibleIndices || eligibleIndices.has(p)) {
        possiblePos.push(p);
      }
    }

    if (possiblePos.length === 0) {
      // If no eligible positions in current window, we have a violation of either min/max or eligible pool
      throw new Error(
        `Cannot place PM trial ${i + 1}/${nPm}: no eligible trials found between indices ${minPos} and ${maxPos}.`,
      );
    }

    // Pick one of the possible positions
    const pos = possiblePos[rng.int(0, possiblePos.length - 1)];
    positions.push(pos);
    lastPos = pos;
  }

  return positions;
}

export function resolveProspectiveMemoryCueMatch(
  context: ProspectiveMemoryCueContext,
  rules: ProspectiveMemoryCueRule[],
): ProspectiveMemoryCueMatch {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (matchesRule(context, rule)) {
      return {
        matched: true,
        responseKey: rule.responseKey,
        ruleId: rule.id ?? `rule_${i + 1}`,
      };
    }
  }
  return { matched: false, responseKey: null, ruleId: null };
}

function normalizeToken(value: unknown, caseSensitive: boolean): string {
  const token = String(value ?? "");
  return caseSensitive ? token : token.toLowerCase();
}

function matchesRule(context: ProspectiveMemoryCueContext, rule: ProspectiveMemoryCueRule): boolean {
  if (rule.type === "category_in") {
    const value = normalizeToken(context.category ?? "", false);
    if (!value) return false;
    const allowed = new Set(rule.categories.map((entry) => normalizeToken(entry, false)));
    return allowed.has(value);
  }
  if (rule.type === "text_starts_with") {
    const caseSensitive = rule.caseSensitive === true;
    const text = normalizeToken(context.stimulusText ?? "", caseSensitive);
    if (!text) return false;
    return rule.prefixes.some((prefix) => text.startsWith(normalizeToken(prefix, caseSensitive)));
  }
  if (rule.type === "stimulus_color") {
    const caseSensitive = rule.caseSensitive === true;
    const color = normalizeToken(context.stimulusColor ?? "", caseSensitive);
    if (!color) return false;
    const allowed = new Set(rule.colors.map((entry) => normalizeToken(entry, caseSensitive)));
    return allowed.has(color);
  }
  const actual = context.flags?.[rule.flag];
  return actual === rule.value;
}
