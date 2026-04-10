/**
 * @vitest-environment jsdom
 *
 * PM placement Monte Carlo simulation.
 * Simulates how often the injector can successfully place PM trials
 * in an n-back block, given the locked-source constraint introduced by the bug fix.
 *
 * Run with:  npx vitest run pm-placement-sim.ts
 */

import { describe, it } from 'vitest';
import { SeededRandom, generateProspectiveMemoryPositions } from '@experiments/core';
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

// Eligible trial types for PM injection (types NOT locked that PM can replace)
const ELIGIBLE_TYPES = ['F', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];

// Retry budget in buildBlockPlanWithChecks
const RETRY_BUDGET = 30;

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

function injectSequence(seed: number, nTrials: number, nTargets: number, nLures: number) {
  const items = makeItems(nTrials);
  const rng = new SeededRandom(seed);
  const trials = buildTrials(items);
  injectNBackTargets(rng, trials, N_LEVEL, nTargets, 'm');
  for (const lagPass of LURE_LAG_PASSES) {
    const inserted = trials.filter(t => t.trialType.startsWith('L')).length;
    injectNBackLures(rng, trials, N_LEVEL, nLures - inserted, lagPass);
  }
  return trials;
}

function eligibleSet(trials: any[], preFixMode = false): Set<number> {
  return new Set(
    trials
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => {
        if (!ELIGIBLE_TYPES.includes(t.trialType)) return false;
        if (!preFixMode && t.locked) return false;
        return true;
      })
      .map(({ i }) => i)
  );
}

function successRate(
  nTrials: number,
  nTargets: number,
  nLures: number,
  maxSep: number,
  preFixMode = false,
): { rate: number; minElig: number; avgElig: number } {
  let ok = 0;
  let totalElig = 0;
  let minElig = Infinity;

  for (let seed = 0; seed < N_SEEDS; seed++) {
    const trials = injectSequence(seed, nTrials, nTargets, nLures);
    const elig = eligibleSet(trials, preFixMode);
    totalElig += elig.size;
    if (elig.size < minElig) minElig = elig.size;
    try {
      generateProspectiveMemoryPositions(
        new SeededRandom(seed + 10000),
        nTrials,
        { count: PM_COUNT, minSeparation: PM_MIN_SEP, maxSeparation: maxSep },
        elig,
      );
      ok++;
    } catch { /* placement failed */ }
  }

  return { rate: (ok / N_SEEDS) * 100, minElig, avgElig: totalElig / N_SEEDS };
}

function pAllFail(ratePercent: number, retries: number) {
  return (Math.pow(1 - ratePercent / 100, retries) * 100).toFixed(3) + '%';
}

// ── Run scenarios ──────────────────────────────────────────────────────────

describe('pm-placement-sim', () => { it('runs simulation', () => {
console.log('PM Placement Monte Carlo Simulation');
console.log(`Seeds: ${N_SEEDS} | PM: count=${PM_COUNT}, minSep=${PM_MIN_SEP}, maxSep=${PM_MAX_SEP}`);
console.log(`n-level: ${N_LEVEL} | Retry budget: ${RETRY_BUDGET}\n`);

type Scenario = { label: string; nTrials: number; nTargets: number; nLures: number; maxSep: number; preFix?: boolean };

const scenarios: Scenario[] = [
  { label: `Pre-fix  (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=${PM_MAX_SEP})`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: PM_MAX_SEP, preFix: true },
  { label: `Post-fix (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=16)`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 16, preFix: false },
  { label: `Post-fix (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=17)`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 17, preFix: false },
  { label: `Post-fix (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=18)`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 18, preFix: false },
  { label: `Post-fix (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=19)`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 19, preFix: false },
  { label: `Post-fix (${N_TRIALS}t, ${N_TARGETS}T, ${N_LURES}L, maxSep=20)`,  nTrials: N_TRIALS, nTargets: N_TARGETS, nLures: N_LURES, maxSep: 20, preFix: false },
];

console.log('Scenario                                     elig  success  Pr(all fail in 30)');
console.log('─'.repeat(80));

for (const s of scenarios) {
  const { rate, avgElig } = successRate(s.nTrials, s.nTargets, s.nLures, s.maxSep, s.preFix ?? false);
  const failProb = pAllFail(rate, RETRY_BUDGET);
  console.log(
    `${s.label.padEnd(45)}` +
    `  ${String(Math.round(avgElig)).padStart(3)}` +
    `   ${rate.toFixed(1).padStart(6)}%` +
    `   ${failProb}`
  );
}
}); });
