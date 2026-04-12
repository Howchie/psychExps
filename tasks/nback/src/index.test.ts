/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { __testing__, nbackAdapter } from './index';
import { createResponseSemantics, createVariableResolver, SeededRandom, StimulusInjectorModule, generateProspectiveMemoryPositions } from '@experiments/core';

// PlannedTrial is a private interface — infer its shape from the inject function signature.
type NbackTrial = Parameters<(typeof __testing__)['injectNBackTargets']>[1][number];

describe('NbackTaskAdapter', () => {
  it('exposes manifest and lifecycle hooks', () => {
    expect(nbackAdapter.manifest.taskId).toBe('nback');
    expect(typeof nbackAdapter.initialize).toBe('function');
    expect(typeof nbackAdapter.execute).toBe('function');
    expect(typeof nbackAdapter.terminate).toBe('function');
  });

  it('restores container presentation helper output correctly', async () => {
    const container = document.createElement('div');
    container.style.maxWidth = '640px';
    container.style.margin = '12px';
    container.style.fontFamily = 'serif';
    container.style.lineHeight = '1.8';

    const prior = __testing__.applyNbackRootPresentation(container);
    expect(container.classList.contains('exp-jspsych-canvas-centered')).toBe(true);
    __testing__.restoreNbackRootPresentation(container, prior);

    expect(container.style.maxWidth).toBe('640px');
    expect(container.style.margin).toBe('12px');
    expect(container.style.fontFamily).toBe('serif');
    expect(container.style.lineHeight).toBe('1.8');
    expect(container.classList.contains('exp-jspsych-canvas-centered')).toBe(false);
  });

  it('should capture the current trial response row directly from the response window', () => {
    const timeline: any[] = [];
    const capture = __testing__.appendJsPsychNbackTrial({
      timeline,
      parsed: {
        timing: {
          trialDurationMs: 1000,
          fixationDurationMs: 200,
          stimulusOnsetMs: 300,
          responseWindowStartMs: 300,
          responseWindowEndMs: 1000,
        },
        display: {
          aperturePx: 300,
          paddingYPx: 20,
          cueHeightPx: 0,
          cueMarginBottomPx: 0,
          frameBackground: '#fff',
          frameBorder: '1px solid #000',
          textColor: '#111',
          fixationFontSizePx: 24,
          fixationFontWeight: 500,
          stimulusFontSizePx: 40,
          stimulusScale: 1,
          imageWidthPx: null,
          imageHeightPx: null,
          imageUpscale: false,
        },
        responseSemantics: createResponseSemantics({ target: 'm', non_target: 'z' }),
      } as any,
      block: {
        label: 'Block 1',
        blockIndex: 0,
        blockType: 'practice',
        isPractice: true,
        nLevel: 2,
        stimulusVariant: null,
        trials: [],
        feedback: {
          enabled: false,
          durationMs: 0,
          messages: {
            correct: 'Correct',
            incorrect: 'Incorrect',
            timeout: 'Too slow',
            invalid: 'Invalid key',
            byResponseCategory: {},
          },
          style: {
            correctColor: '#22c55e',
            incorrectColor: '#ef4444',
            timeoutColor: '#f59e0b',
            invalidColor: '#f59e0b',
            byResponseCategoryColors: {},
            fontSizePx: 28,
            fontWeight: 700,
            canvasBackground: '#ffffff',
            canvasBorder: '2px solid #ddd',
          },
        },
        rtTask: {
          enabled: false,
          responseTerminatesTrial: false,
          timing: {
            trialDurationMs: 1000,
            fixationDurationMs: 200,
            stimulusOnsetMs: 300,
            responseWindowStartMs: 300,
            responseWindowEndMs: 1000,
          }
        },
        beforeBlockScreens: [],
        afterBlockScreens: [],
        drt: { enabled: false },
        variables: {},
      } as any,
      trial: {
        trialIndex: 3,
        blockIndex: 0,
        trialType: 'target',
        item: 'A',
        sourceCategory: 'other',
        itemCategory: 'other',
        correctResponse: 'm',
      } as any,
      resolvedStimulus: 'A',
      runtime: {
        participantId: 'p1',
        variantId: 'v1',
        variableResolver: createVariableResolver({}),
      } as any,
      preloaded: { image: null },
      eventLogger: {
        emit: vi.fn(),
      } as any,
    });

    const responseWindow = timeline.find((entry) => entry.data?.phase?.startsWith('nback_response_window'));
    expect(responseWindow).toBeTruthy();

    responseWindow.on_finish({
      ...responseWindow.data,
      response: 'm',
      rt: 450,
    });

    expect(capture.responseWindowRow).toEqual(
      expect.objectContaining({
        blockIndex: 0,
        trialIndex: 3,
        responseKey: 'm',
        responseCorrect: 1,
        responseRtMs: 450,
      }),
    );
  });

  it('Monte Carlo: eligible positions and PM placement reliability post-fix', () => {
    const { injectNBackTargets, injectNBackLures } = __testing__;
    const injector = new StimulusInjectorModule();

    // annikaHons main block parameters
    const N_TRIALS = 100;
    const N_TARGETS = 18;   // default for main blocks
    const N_LURES = 18;     // default for main blocks
    const N_LEVEL = 2;
    const LURE_LAG_PASSES = [[4, 5], [6, 7, 8, 9]];
    const PM_COUNT = 10;
    const PM_MIN_SEP = 8;
    const PM_MAX_SEP = 15;
    const N_SEEDS = 500;

    const items = Array.from({ length: N_TRIALS }, (_, i) =>
      String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26)
    );

    let successes = 0;
    let totalEligible = 0;
    let minEligibleSeen = Infinity;
    const eligibleCounts: number[] = [];
    const failures: string[] = [];

    for (let seed = 0; seed < N_SEEDS; seed++) {
      const rng = new SeededRandom(seed);
      const trials = items.map((item, i) => ({
        trialIndex: i, blockIndex: 0, trialType: 'F',
        item, sourceCategory: 'other', itemCategory: 'other', correctResponse: 'z',
      })) as NbackTrial[];

      injectNBackTargets(rng, trials, N_LEVEL, N_TARGETS, 'm');
      for (const lagPass of LURE_LAG_PASSES) {
        injectNBackLures(rng, trials, N_LEVEL, N_LURES - trials.filter(t => t.trialType.startsWith('L')).length, lagPass);
      }

      const eligible = trials.filter(t =>
        !t.locked && ['F', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'].includes(t.trialType)
      ).length;
      totalEligible += eligible;
      eligibleCounts.push(eligible);
      if (eligible < minEligibleSeen) minEligibleSeen = eligible;

      // Try PM injection
      const block = { trials: trials.map(t => ({ ...t })) };
      const pmItems = Array.from({ length: 20 }, (_, i) => `pm${i}`);
      try {
        injector.transformBlockPlan(
          block,
          {
            enabled: true,
            injections: [{
              id: 'pm',
              enabled: true,
              eligibleTrialTypes: ['F', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'],
              schedule: { count: PM_COUNT, minSeparation: PM_MIN_SEP, maxSeparation: PM_MAX_SEP },
              source: { type: 'literal', items: pmItems, sourceCategory: 'pm' },
              set: { trialType: 'PM', itemCategory: 'PM', correctResponse: 'space' },
            }],
          },
          { rng: new SeededRandom(seed + 10000), stimuliByCategory: {}, resolver: null as any, blockIndex: 0, locals: {} },
        );
        successes++;
      } catch (e: any) {
        if (failures.length < 3) failures.push(`seed ${seed}: ${e.message}`);
      }
    }

    const avgEligible = totalEligible / N_SEEDS;
    const minEligible = minEligibleSeen;
    const maxEligible = Math.max(...eligibleCounts);
    const successRate = (successes / N_SEEDS) * 100;

    console.log('\n── MONTE CARLO ANALYSIS (annikaHons main block, n=500 seeds) ────');
    console.log(`Block size: ${N_TRIALS} trials | Targets: ${N_TARGETS} | Lures: ${N_LURES}`);
    console.log(`PM: count=${PM_COUNT}, minSep=${PM_MIN_SEP}, maxSep=${PM_MAX_SEP}`);
    console.log(`\nEligible positions post-fix (F + L# that are not locked):`);
    console.log(`  avg=${avgEligible.toFixed(1)}, min=${minEligible}, max=${maxEligible}`);
    console.log(`\nPM placement success rate: ${successes}/${N_SEEDS} = ${successRate.toFixed(1)}%`);
    if (failures.length > 0) {
      console.log(`\nSample failures:`);
      failures.forEach(f => console.log(`  ${f}`));
    }

    // Breakdown: how many of the 100 positions fall in each category (average)
    let cntN = 0, cntLockedF = 0, cntL = 0, cntFree = 0;
    const rngSample = new SeededRandom(99999);
    const sampleTrials = items.map((item, i) => ({
      trialIndex: i, blockIndex: 0, trialType: 'F',
      item, sourceCategory: 'other', itemCategory: 'other', correctResponse: 'z',
    })) as NbackTrial[];
    injectNBackTargets(rngSample, sampleTrials, N_LEVEL, N_TARGETS, 'm');
    for (const lagPass of LURE_LAG_PASSES) {
      injectNBackLures(rngSample, sampleTrials, N_LEVEL, N_LURES - sampleTrials.filter(t => t.trialType.startsWith('L')).length, lagPass);
    }
    sampleTrials.forEach(t => {
      if (t.trialType === 'N') cntN++;
      else if (t.locked) cntLockedF++;
      else if (t.trialType.startsWith('L')) cntL++;
      else cntFree++;
    });
    console.log(`\nTypical trial type breakdown (seed 99999):`);
    console.log(`  N (targets):          ${cntN}  — excluded from injection`);
    console.log(`  F locked (sources):   ${cntLockedF}  — excluded post-fix`);
    console.log(`  L# (lures):           ${cntL}  — eligible`);
    console.log(`  F free:               ${cntFree}  — eligible`);
    console.log(`  Total eligible:       ${cntL + cntFree}`);

    // --- Compare pre-fix vs post-fix vs different block sizes / maxSep ---
    const runSuccessRate = (nTrials: number, maxSep: number, eligibleFn: (t: any) => boolean): number => {
      let ok = 0;
      const localItems = Array.from({ length: nTrials }, (_, i) =>
        String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26)
      );
      for (let seed = 0; seed < N_SEEDS; seed++) {
        const r = new SeededRandom(seed);
        const tr = localItems.map((item, i) => ({
          trialIndex: i, blockIndex: 0, trialType: 'F',
          item, sourceCategory: 'other', itemCategory: 'other', correctResponse: 'z',
        })) as NbackTrial[];
        injectNBackTargets(r, tr, N_LEVEL, N_TARGETS, 'm');
        for (const lp of LURE_LAG_PASSES) {
          injectNBackLures(r, tr, N_LEVEL, N_LURES - tr.filter(t => t.trialType.startsWith('L')).length, lp);
        }
        const eligIdx = new Set(tr.map((t, i) => ({ t, i })).filter(({ t }) => eligibleFn(t)).map(({ i }) => i));
        try {
          generateProspectiveMemoryPositions(new SeededRandom(seed + 10000), nTrials, { count: PM_COUNT, minSeparation: PM_MIN_SEP, maxSeparation: maxSep }, eligIdx);
          ok++;
        } catch { /* placement failed */ }
      }
      return (ok / N_SEEDS) * 100;
    };

    // Pre-fix eligible: no locked check (locked F positions counted as eligible)
    const preFix = (t: any) => ['F', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'].includes(t.trialType);
    const postFix = (t: any) => !t.locked && ['F', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'].includes(t.trialType);

    console.log('\n── CONFIGURATION COMPARISON ─────────────────────────────────');
    console.log(`Scenario                                       success rate`);
    const preFixRate = runSuccessRate(100, 15, preFix);
    console.log(`Pre-fix  (100t, maxSep=15, ~82 elig):          ${preFixRate.toFixed(1)}%`);
    console.log(`Post-fix (100t, maxSep=15, ~46 elig):          ${successRate.toFixed(1)}%  ← current`);
    const maxSep20Rate = runSuccessRate(100, 20, postFix);
    console.log(`Post-fix (100t, maxSep=20, ~46 elig):          ${maxSep20Rate.toFixed(1)}%`);
    const maxSep25Rate = runSuccessRate(100, 25, postFix);
    console.log(`Post-fix (100t, maxSep=25, ~46 elig):          ${maxSep25Rate.toFixed(1)}%`);
    const trials110Rate = runSuccessRate(110, 15, postFix);
    console.log(`Post-fix (110t, maxSep=15, ~56 elig):          ${trials110Rate.toFixed(1)}%`);

    const retryBudget = 30;
    console.log(`\nWith ${retryBudget}-attempt retry budget:`);
    console.log(`  Pr(all fail) at ${successRate.toFixed(1)}%:  ${(Math.pow(1 - successRate/100, retryBudget) * 100).toFixed(3)}%`);
    console.log(`  Pr(all fail) at ${maxSep20Rate.toFixed(1)}%: ${(Math.pow(1 - maxSep20Rate/100, retryBudget) * 100).toFixed(3)}%`);
    console.log(`  Pr(all fail) at ${maxSep25Rate.toFixed(1)}%: ${(Math.pow(1 - maxSep25Rate/100, retryBudget) * 100).toFixed(3)}%`);

    expect(successRate).toBeGreaterThanOrEqual(0); // informational — no hard assertion on rate
  });

  it('PM injector does not overwrite locked n-back source positions', () => {
    const { injectNBackTargets, injectNBackLures } = __testing__;

    // Build a minimal 20-trial 2-back sequence with items A–T
    const items = 'ABCDEFGHIJKLMNOPQRST'.split('');
    const makeTrials = (): NbackTrial[] => items.map((item, i) => ({
      trialIndex: i,
      blockIndex: 0,
      trialType: 'F',
      item,
      sourceCategory: 'other',
      itemCategory: 'other',
      correctResponse: 'z',
    }));

    // ── Build the sequence ──────────────────────────────────────────────────
    const trials = makeTrials();
    const rng = new SeededRandom(42);
    injectNBackTargets(rng, trials, 2, 4, 'm');
    injectNBackLures(rng, trials, 2, 2, [4, 5]);

    // Identify locked source positions (F trials that are n-back sources)
    const lockedPositions = trials
      .map((t, i) => ({ i, t }))
      .filter(({ t }) => t.locked && t.trialType === 'F')
      .map(({ i }) => i);

    // Identify N-back target positions and their source positions
    const targetPositions = trials
      .map((t, i) => ({ i, t }))
      .filter(({ t }) => t.trialType === 'N')
      .map(({ i }) => i);

    // Print pre-injection sequence
    console.log('\n── PRE-INJECTION SEQUENCE ────────────────────────────────────');
    console.log('pos  item  type  locked  usedAsSource');
    trials.forEach((t, i) => {
      const locked = t.locked ? '✓' : ' ';
      const used = t.usedAsSource ? '✓' : ' ';
      console.log(`  ${String(i).padStart(2)}   ${t.item}    ${t.trialType.padEnd(4)}  ${locked}       ${used}`);
    });
    console.log(`\nTarget positions: [${targetPositions.join(', ')}]`);
    console.log(`Locked source positions: [${lockedPositions.join(', ')}]`);

    // ── PRE-FIX: simulate old injector eligibility (no locked check) ────────
    const eligiblePreFix = trials
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => ['F', 'L2', 'L4', 'L5'].includes(t.trialType))
      .map(({ i }) => i);

    const lockedButEligiblePreFix = eligiblePreFix.filter(i => trials[i].locked);
    console.log('\n── PRE-FIX: injector eligible positions ──────────────────────');
    console.log(`Eligible: [${eligiblePreFix.join(', ')}]`);
    console.log(`Locked positions that were wrongly eligible: [${lockedButEligiblePreFix.join(', ')}]`);

    // ── POST-FIX: run actual StimulusInjectorModule ─────────────────────────
    const injector = new StimulusInjectorModule();
    const rng2 = new SeededRandom(42);
    const pmItems = ['PM1', 'PM2', 'PM3', 'PM4', 'PM5'];
    const block = { trials: trials.map(t => ({ ...t })) };
    const injectedBlock = injector.transformBlockPlan(
      block,
      {
        enabled: true,
        injections: [{
          id: 'pm_injection',
          enabled: true,
          eligibleTrialTypes: ['F', 'L2', 'L4', 'L5'],
          schedule: { count: 3, minSeparation: 3, maxSeparation: 8 },
          source: { type: 'literal', items: pmItems, sourceCategory: 'pm' },
          set: { trialType: 'PM', itemCategory: 'PM', correctResponse: 'space' },
        }],
      },
      { rng: rng2, stimuliByCategory: {}, resolver: null as any, blockIndex: 0, locals: {} },
    );

    const pmPositions: number[] = (injectedBlock as any).injectionLog?.[0]?.positions ?? [];
    console.log('\n── POST-FIX: injected PM positions ──────────────────────────');
    console.log(`PM inserted at: [${pmPositions.join(', ')}]`);
    console.log('\npos  item        type  locked  note');
    (injectedBlock as any).trials.forEach((t: any, i: number) => {
      const orig = trials[i];
      const tag = t.trialType === 'PM' ? '← PM injected' :
                  orig.locked ? '← source (locked)' :
                  t.trialType === 'N' ? '← n-back target' :
                  t.trialType.startsWith('L') ? '← lure' : '';
      console.log(`  ${String(i).padStart(2)}   ${t.item.padEnd(10)}  ${t.trialType.padEnd(4)}  ${orig.locked ? '✓' : ' '}       ${tag}`);
    });

    // ── Assertions ──────────────────────────────────────────────────────────

    // 1. PM must not be placed at any locked (source) position
    for (const pos of pmPositions) {
      expect(trials[pos].locked, `PM placed at locked source position ${pos}`).toBeFalsy();
    }

    // 2. N-back target items must still match their source n-back positions
    for (const targetPos of targetPositions) {
      const sourcePos = targetPos - 2;
      const targetItem = (injectedBlock as any).trials[targetPos].item;
      const sourceItem = (injectedBlock as any).trials[sourcePos].item;
      expect(targetItem, `N trial at ${targetPos}: item should still match source at ${sourcePos}`).toBe(sourceItem);
    }

    // 3. PM must not replace N trials (already covered by eligibleTrialTypes, belt-and-suspenders)
    for (const pos of pmPositions) {
      expect(trials[pos].trialType, `PM placed at N trial position ${pos}`).not.toBe('N');
    }

    console.log('\n✓ All assertions passed: locked source positions were protected.');
  });

  it('PM-first generation keeps PM categorization valid and prevents downstream overwrites', () => {
    const { injectNBackTargets, injectNBackLures } = __testing__;
    const injector = new StimulusInjectorModule();

    const N_TRIALS = 60;
    const PM_COUNT = 5;
    const N_LEVEL = 2;
    const TARGET_COUNT = 12;
    const LURE_COUNT = 8;
    const LURE_LAG_PASSES = [[4, 5], [6, 7]];

    const baseTrials = Array.from({ length: N_TRIALS }, (_, i) => ({
      trialIndex: i,
      blockIndex: 0,
      trialType: 'F',
      item: `base_${i + 1}`,
      sourceCategory: 'other',
      itemCategory: 'other',
      correctResponse: 'z',
      locked: false,
      usedAsSource: false,
    })) as NbackTrial[];

    const pmItems = Array.from({ length: 20 }, (_, i) => `pm_${i + 1}`);
    const injectedBlock = injector.transformBlockPlan(
      { blockIndex: 0, trials: baseTrials.map((trial) => ({ ...trial })) },
      {
        enabled: true,
        injections: [
          {
            id: 'pm_first_pass',
            enabled: true,
            eligibleTrialTypes: ['F'],
            schedule: { count: PM_COUNT, minSeparation: 6, maxSeparation: 10 },
            source: { type: 'literal', items: pmItems, sourceCategory: 'animals' },
            set: { trialType: 'PM', itemCategory: 'PM', correctResponse: 'space', responseCategory: 'pm' },
          },
        ],
      },
      {
        rng: new SeededRandom(1234),
        stimuliByCategory: {},
      } as any,
    ) as { trials: NbackTrial[]; injectionLog?: Array<{ id: string; positions: number[] }> };

    const pmPositions = injectedBlock.injectionLog?.[0]?.positions ?? [];
    expect(pmPositions.length).toBe(PM_COUNT);

    const pmSnapshot = new Map<number, string>();
    for (const pos of pmPositions) {
      pmSnapshot.set(pos, injectedBlock.trials[pos].item);
    }

    const nbackRng = new SeededRandom(5678);
    injectNBackTargets(nbackRng, injectedBlock.trials, N_LEVEL, TARGET_COUNT, 'm');
    let insertedLures = 0;
    for (const lagPass of LURE_LAG_PASSES) {
      insertedLures += injectNBackLures(nbackRng, injectedBlock.trials, N_LEVEL, LURE_COUNT - insertedLures, lagPass);
    }

    // PM trials remain PM, categorized as PM, and unchanged after target/lure insertion.
    for (const pos of pmPositions) {
      const trial = injectedBlock.trials[pos];
      expect(trial.trialType).toBe('PM');
      expect(trial.item).toBe(pmSnapshot.get(pos));
      expect(trial.itemCategory).toBe('PM');
      expect((trial as any).expectedCategory).toBe('pm');
      expect(trial.sourceCategory).toBe('animals');
      expect(trial.locked).toBeTruthy();
    }

    // N-back targets must not use PM as their source.
    for (let i = 0; i < injectedBlock.trials.length; i += 1) {
      const trial = injectedBlock.trials[i];
      if (trial.trialType !== 'N') continue;
      const source = injectedBlock.trials[i - N_LEVEL];
      expect(source.trialType, `N trial at ${i} sourced from PM trial at ${i - N_LEVEL}`).not.toBe('PM');
    }

    // Lures must not use PM as their source.
    for (let i = 0; i < injectedBlock.trials.length; i += 1) {
      const trial = injectedBlock.trials[i];
      const lureMatch = /^L(\d+)$/.exec(trial.trialType);
      if (!lureMatch) continue;
      const lag = Number(lureMatch[1]);
      const source = injectedBlock.trials[i - lag];
      expect(source.trialType, `Lure trial at ${i} sourced from PM trial at ${i - lag}`).not.toBe('PM');
    }
  });

  it('should calculate relative RT correctly when response window is segmented', () => {
    const timeline: any[] = [];
    const capture = __testing__.appendJsPsychNbackTrial({
      timeline,
      parsed: {
        timing: {
          trialDurationMs: 3000,
          stimulusOnsetMs: 750,
          responseWindowStartMs: 750,
          responseWindowEndMs: 3000,
        },
        display: {
          aperturePx: 300,
          paddingYPx: 20,
          cueHeightPx: 0,
          cueMarginBottomPx: 0,
          frameBackground: '#fff',
          frameBorder: '1px solid #000',
          textColor: '#111',
          fixationFontSizePx: 24,
          fixationFontWeight: 500,
          stimulusFontSizePx: 40,
          stimulusScale: 1,
          imageWidthPx: null,
          imageHeightPx: null,
          imageUpscale: false,
        },
        responseSemantics: createResponseSemantics({ target: 'm', non_target: 'z' }),
      } as any,
      block: {
        label: 'Block 1',
        blockIndex: 0,
        blockType: 'practice',
        isPractice: true,
        nLevel: 2,
        stimulusVariant: null,
        trials: [],
        feedback: {
          enabled: false,
          durationMs: 0,
          messages: {
            correct: 'Correct',
            incorrect: 'Incorrect',
            timeout: 'Too slow',
            invalid: 'Invalid key',
            byResponseCategory: {},
          },
          style: {
            correctColor: '#22c55e',
            incorrectColor: '#ef4444',
            timeoutColor: '#f59e0b',
            invalidColor: '#f59e0b',
            byResponseCategoryColors: {},
            fontSizePx: 28,
            fontWeight: 700,
            canvasBackground: '#ffffff',
            canvasBorder: '2px solid #ddd',
          },
        },
        rtTask: {
          enabled: true,
          responseTerminatesTrial: false,
          timing: {
            trialDurationMs: 3000,
            stimulusOnsetMs: 750,
            responseWindowStartMs: 750,
            responseWindowEndMs: 3000,
          }
        },
        beforeBlockScreens: [],
        afterBlockScreens: [],
        drt: { enabled: false },
        variables: {},
      } as any,
      trial: {
        trialIndex: 5,
        blockIndex: 0,
        trialType: 'target',
        item: 'B',
        sourceCategory: 'other',
        itemCategory: 'other',
        correctResponse: 'm',
      } as any,
      resolvedStimulus: 'B',
      runtime: {
        participantId: 'p1',
        variantId: 'v1',
        variableResolver: createVariableResolver({}),
      } as any,
      preloaded: { image: null },
      eventLogger: { emit: vi.fn() } as any,
    });

    // In this config (start=750, stimulus=750), the first segment is response_window_stimulus
    const responseSegment = timeline.find((entry) => entry.data?.phase === 'nback_response_window_stimulus');
    expect(responseSegment).toBeTruthy();

    responseSegment.on_finish({
      ...responseSegment.data,
      response: 'm',
      rt: 250, // Relative to start of segment (750ms)
    });

    expect(capture.responseWindowRow).toEqual(
      expect.objectContaining({
        trialIndex: 5,
        responseKey: 'm',
        responseCorrect: 1,
        responseRtMs: 250,
      }),
    );
  });
});
