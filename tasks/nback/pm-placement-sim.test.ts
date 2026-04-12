/**
 * @vitest-environment jsdom
 *
 * PM-first N-back Monte Carlo simulation.
 * Simulates the generation pipeline:
 *   1) filler draw
 *   2) PM injection (locked)
 *   3) target insertion (must hit requested count)
 *   4) lure insertion (best-effort up to max)
 *
 * Run with:  npx vitest run pm-placement-sim.test.ts
 */

import { describe, it } from 'vitest';
import { SeededRandom, StimulusInjectorModule } from '@experiments/core';
import { __testing__ } from './src/index.ts';

const { injectNBackTargets, injectNBackLures } = __testing__;

// ── Parameters to tweak ────────────────────────────────────────────────────

const N_TRIALS    = 100;
const N_TARGETS   = 20;
const N_LURES     = 14;
const N_LEVEL     = 2;
const LURE_LAG_PASSES = [[4, 5], [6, 7, 8, 9]] as number[][];

const PM_COUNT    = 10;
const PM_MIN_SEP  = 8;
const PM_MAX_SEP  = 18;

const N_SEEDS     = 2000;   // increase for tighter confidence intervals

// Retry budget in buildBlockPlanWithChecks.
const RETRY_BUDGET = 30;
const TARGET_INSERTION_ATTEMPTS = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItems(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26));
}

function buildTrials(items: string[]) {
  return items.map((item, i) => ({
    trialIndex: i, blockIndex: 0, trialType: 'F',
    item, sourceCategory: 'other', itemCategory: 'other', correctResponse: 'z',
    locked: false, usedAsSource: false,
  }));
}

type AttemptResult = {
  ok: boolean;
  pmPlaced: number;
  targetsPlaced: number;
  luresPlaced: number;
  failureReason: 'pm_count' | 'target_count' | null;
};

function runSingleAttempt(
  seed: number,
  nTrials: number,
  nTargets: number,
  nLures: number,
  maxSep: number,
): AttemptResult {
  const items = makeItems(nTrials);
  const injector = new StimulusInjectorModule();

  const block = { blockIndex: 0, trials: buildTrials(items) };
  let afterPm: any;
  try {
    afterPm = injector.transformBlockPlan(
      block,
      {
        enabled: true,
        injections: [{
          id: 'pm',
          enabled: true,
          eligibleTrialTypes: ['F'],
          schedule: { count: PM_COUNT, minSeparation: PM_MIN_SEP, maxSeparation: maxSep },
          source: { type: 'literal', items: makeItems(500), sourceCategory: 'pm' },
          set: { trialType: 'PM', itemCategory: 'PM', correctResponse: 'space', responseCategory: 'pm' },
        }],
      },
      {
        rng: new SeededRandom(seed + 10000),
        stimuliByCategory: {},
      } as any,
    );
  } catch {
    return { ok: false, pmPlaced: 0, targetsPlaced: 0, luresPlaced: 0, failureReason: 'pm_count' };
  }

  const trials = afterPm.trials as any[];
  const pmPlaced = trials.filter((t) => t.trialType === 'PM').length;
  if (pmPlaced !== PM_COUNT) {
    return { ok: false, pmPlaced, targetsPlaced: 0, luresPlaced: 0, failureReason: 'pm_count' };
  }

  const rng = new SeededRandom(seed + 20000);
  let targetsPlaced = 0;
  for (let i = 0; i < TARGET_INSERTION_ATTEMPTS; i += 1) {
    targetsPlaced += injectNBackTargets(rng, trials, N_LEVEL, nTargets - targetsPlaced, 'm');
    if (targetsPlaced >= nTargets) break;
  }
  if (targetsPlaced !== nTargets) {
    return { ok: false, pmPlaced, targetsPlaced, luresPlaced: 0, failureReason: 'target_count' };
  }

  let luresPlaced = 0;
  for (const lagPass of LURE_LAG_PASSES) {
    luresPlaced += injectNBackLures(rng, trials, N_LEVEL, nLures - luresPlaced, lagPass);
    if (luresPlaced >= nLures) break;
  }

  // Lures are max/best-effort now: do not fail if underfilled.
  return { ok: true, pmPlaced, targetsPlaced, luresPlaced, failureReason: null };
}

type MonteCarloSummary = {
  successRate: number;
  failuresPm: number;
  failuresTarget: number;
  avgLuresPlaced: number;
  minLuresPlaced: number;
  maxLuresPlaced: number;
};

function runMonteCarlo(
  nTrials: number,
  nTargets: number,
  nLures: number,
  maxSep: number,
): MonteCarloSummary {
  let successes = 0;
  let failuresPm = 0;
  let failuresTarget = 0;

  let totalLuresPlaced = 0;
  let minLuresPlaced = Infinity;
  let maxLuresPlaced = -Infinity;

  for (let seed = 0; seed < N_SEEDS; seed += 1) {
    let succeeded = false;
    let lastReason: 'pm_count' | 'target_count' | null = null;
    let finalLuresPlaced = 0;

    for (let attempt = 0; attempt < RETRY_BUDGET; attempt += 1) {
      const attemptResult = runSingleAttempt(seed + attempt * 100000, nTrials, nTargets, nLures, maxSep);
      if (attemptResult.ok) {
        succeeded = true;
        finalLuresPlaced = attemptResult.luresPlaced;
        break;
      }
      lastReason = attemptResult.failureReason;
    }

    if (succeeded) {
      successes += 1;
      totalLuresPlaced += finalLuresPlaced;
      minLuresPlaced = Math.min(minLuresPlaced, finalLuresPlaced);
      maxLuresPlaced = Math.max(maxLuresPlaced, finalLuresPlaced);
      continue;
    }

    if (lastReason === 'pm_count') failuresPm += 1;
    else failuresTarget += 1;
  }

  const successRate = (successes / N_SEEDS) * 100;
  const avgLuresPlaced = successes > 0 ? totalLuresPlaced / successes : 0;
  if (!Number.isFinite(minLuresPlaced)) minLuresPlaced = 0;
  if (!Number.isFinite(maxLuresPlaced)) maxLuresPlaced = 0;

  return {
    successRate,
    failuresPm,
    failuresTarget,
    avgLuresPlaced,
    minLuresPlaced,
    maxLuresPlaced,
  };
}

// ── Run scenarios ──────────────────────────────────────────────────────────

describe('pm-placement-sim', () => { it('runs simulation', () => {
console.log('PM-First NBack Monte Carlo Simulation');
console.log(`Seeds: ${N_SEEDS} | PM: count=${PM_COUNT}, minSep=${PM_MIN_SEP}, maxSep=${PM_MAX_SEP}`);
console.log(`n-level: ${N_LEVEL} | Retry budget: ${RETRY_BUDGET} | Target attempts: ${TARGET_INSERTION_ATTEMPTS}`);
console.log(`Lures are treated as max count (best-effort), not a hard requirement.\n`);

type Scenario = { label: string; nTrials: number; nTargets: number; nLures: number; maxSep: number };

const scenarios: Scenario[] = [
  { label: `PM-first (${N_TRIALS}t, ${N_TARGETS}T, <=${N_LURES}L, maxSep=16)`, nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 16 },
  { label: `PM-first (${N_TRIALS}t, ${N_TARGETS}T, <=${N_LURES}L, maxSep=17)`, nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 17 },
  { label: `PM-first (${N_TRIALS}t, ${N_TARGETS}T, <=${N_LURES}L, maxSep=18)`, nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 18 },
  { label: `PM-first (${N_TRIALS}t, ${N_TARGETS}T, <=${N_LURES}L, maxSep=19)`, nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 19 },
  { label: `PM-first (${N_TRIALS}t, ${N_TARGETS}T, <=${N_LURES}L, maxSep=20)`, nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 20 },
];

console.log('Scenario                                     success   fail(pm)  fail(target)   lures placed (avg|min|max)');
console.log('─'.repeat(80));

for (const s of scenarios) {
  const summary = runMonteCarlo(s.nTrials, s.nTargets, s.nLures, s.maxSep);
  console.log(
    `${s.label.padEnd(45)}` +
    `  ${summary.successRate.toFixed(1).padStart(6)}%` +
    `   ${String(summary.failuresPm).padStart(7)}` +
    `   ${String(summary.failuresTarget).padStart(12)}` +
    `   ${summary.avgLuresPlaced.toFixed(1).padStart(5)}|${String(summary.minLuresPlaced).padStart(3)}|${String(summary.maxLuresPlaced).padStart(3)}`
  );
}
}); });
