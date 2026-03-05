# Stroop Task Implementation Plan (`/data/work/Experiments/STROOP_IMPLEMENTATION_PLAN.md`)

## Summary
Implement a new task adapter `stroop` with two modes under one architecture:
1. `mode: "congruence"` (classic Stroop with response by font color).
2. `mode: "valence"` (emotional Stroop, manipulation by word valence, response still by font color).

Design goals:
1. Reuse existing core timing, response capture, feedback, variable resolver, CSV loading, and finalization.
2. Keep blocks identical by default, generated from a single block template + `blockCount`.
3. Use exact condition quotas per block (as selected).
4. Use semantic congruence assignment automatically (as selected), with configurable color-token mapping (`"green" -> "#00FF00"` etc.).

## Scope
In scope:
1. New `tasks/stroop` package (task adapter + parser + planner + renderer + data output).
2. New Stroop configs in `configs/stroop`.
3. App wiring to register/select Stroop task.
4. Task docs and README/docs index updates.
5. Unit tests for trial labeling/planning and parser behavior.

Out of scope:
1. Core refactors for generic factorial condition engines.
2. New shared core color ontology module.
3. Adaptive/staircase Stroop.

## Public API / Interface Changes
1. New task ID: `stroop` in adapter manifest.
2. URL support via existing selector: `?task=stroop&variant=...`.
3. New config namespace consumed by Stroop:
   1. `task` (`title`, optional `runner`).
   2. `mapping` (`redKey`, `greenKey`).
   3. `timing` (fixation/stimulus/response window/trial duration).
   4. `display` (`textColorByToken`, font sizes, frame style).
   5. `conditions` (mode + quota policy).
   6. `stimuli` (inline lists and/or CSV refs).
   7. `plan` (block template + blockCount).
   8. `feedback` (core feedback schema).
   9. `variables` (core variable resolver schema).
4. New output record schema (CSV/JSON rows) includes:
   1. `word`
   2. `fontColorToken`
   3. `fontColorHex`
   4. `mode`
   5. `conditionLabel` (`congruent|incongruent|neutral` or `positive|neutral|negative`)
   6. `correctResponse`
   7. `responseKey`
   8. `responseRtMs`
   9. `responseCorrect`
   10. `blockIndex`, `trialIndex`, participant/variant metadata

## Files To Add/Modify
1. Add `tasks/stroop/package.json`
2. Add `tasks/stroop/tsconfig.json`
3. Add `tasks/stroop/src/index.ts`
4. Add `configs/stroop/default.json`
5. Add `configs/stroop/arbitrary_words.json`
6. Add `configs/stroop/emotional_valence.json`
7. Modify `apps/web/src/main.ts` to import/register `stroopAdapter`
8. Modify `apps/web/src/taskVariantConfigs.ts` to include `stroop: {}`
9. Modify `apps/web/package.json` to add `@experiments/task-stroop`
10. Add `docs/TASK_STROOP.md`
11. Modify `docs/README.md` and root `README.md` to link Stroop docs/configs
12. Optional test location (recommended): `tasks/stroop/src/__tests__/...`

## Detailed Design

### 1) Config Model
1. `mapping`:
   1. `redKey` default `"f"`
   2. `greenKey` default `"j"`
2. `display`:
   1. `textColorByToken`: map color token to CSS color, default `{ "red":"#ff0000", "green":"#00aa00" }`
   2. `stimulusFontSizePx`, `fixationFontSizePx`, frame appearance (reuse PM style params)
3. `stimuli`:
   1. `responseColorTokens`: default `["red","green"]`
   2. `words`: inline list optional
   3. `wordsCsv`: optional CSV source (reuse `loadStimuliPoolsFromCsv`)
   4. `colorLexicon`: optional word->color-token map/aliases (for automatic semantic matching)
   5. `valenceLists`: for emotional mode (`positive`, `neutral`, `negative`) as inline lists or CSV refs
4. `conditions`:
   1. `mode`: `"congruence"` or `"valence"`
   2. `quotaPerBlock`: exact counts per condition label
5. `plan`:
   1. `blockCount`
   2. `blockTemplate` (label template, `trials`, optional feedback override)
   3. Optional constraints (`maxConditionRunLength`, `noImmediateWordRepeat`)

### 2) Trial Labeling Logic
1. Congruence mode labeling:
   1. Normalize word text (`lowercase`, trim).
   2. Resolve `wordColorToken` via `colorLexicon` or exact token match to response colors.
   3. If `wordColorToken === fontColorToken` => `congruent`.
   4. Else if `wordColorToken` exists and is in response color set => `incongruent`.
   5. Else => `neutral`.
2. Valence mode labeling:
   1. Build `word -> valence` lookup from provided valence lists.
   2. Assign condition from lookup.
   3. Words absent from lookup are rejected at parse-time (strict default) to avoid silent miscoding.
3. Correct response:
   1. Determined only by `fontColorToken` via mapping (`redKey`/`greenKey`).

### 3) Trial Generation
1. Build per-block condition quotas exactly from `conditions.quotaPerBlock`.
2. For each condition, sample candidate words consistent with that condition definition.
3. Assign font colors with balanced quotas (50/50 red-green by default; configurable).
4. Interleave condition buckets and shuffle with seeded RNG.
5. Enforce constraints (`maxConditionRunLength`, no immediate repeats) via retry loop.
6. Blocks are identical by default by regenerating from the same template/quotas each block (seeded independently by block index).

### 4) Rendering and Runtime
1. Implement jsPsych runner first (matching SFT simplicity).
2. Use canvas keyboard plugin with phases:
   1. fixation
   2. stimulus + response window
   3. optional feedback
3. Draw centered word with `fontColorHex` from token map.
4. Normalize key responses and evaluate with `evaluateTrialOutcome`.
5. Emit task/block/trial events via `createEventLogger`.
6. Finalize via `finalizeTaskRun` with JSON + CSV.

### 5) Data Contract
1. Record only response-window rows.
2. Include trial-spec fields needed for analysis:
   1. `word`
   2. `fontColorToken`
   3. `wordColorToken` (congruence mode)
   4. `valence` (valence mode)
   5. `conditionLabel`
   6. behavioral outputs (`responseKey`, `responseRtMs`, `responseCorrect`)

## Test Plan

### Parser / Validation
1. Reject duplicate response keys.
2. Reject unknown font color token not found in `textColorByToken`.
3. Reject invalid/missing quotas.
4. Reject valence-mode words not present in any valence list (strict default).

### Labeling Logic
1. `"red"` in red => congruent.
2. `"red"` in green => incongruent.
3. `"blue"` in red/green => neutral (unless lexicon maps blue to response color, which default does not).
4. Arbitrary neutral word from CSV => neutral.
5. Emotional mode words labeled exactly pos/neutral/neg.

### Generation / Balancing
1. Exact per-condition quotas met per block.
2. Exact red/green response balance met per block (default).
3. Constraint checks hold (no repeat/run violations).
4. Deterministic generation for same participant/session/variant seed.

### Runtime / Output
1. Correct key mapping from font color.
2. Timeout recorded as invalid/timeout with `rt=-1`.
3. CSV row count equals number of response-window trials.
4. Final payload includes expected records/events/runner metadata.

## Core-Level Gaps Identified (and handling in this plan)
These look like cross-task core features, but do not currently exist:

1. Shared condition/factorial planner with exact multi-factor quotas and adjacency constraints.
   1. Handling now: implement Stroop-local planner in `tasks/stroop/src/index.ts`.
2. Shared semantic label resolver (word -> category/color/valence) with CSV dictionary utilities.
   1. Handling now: implement Stroop-local resolver using existing CSV loader and local lookups.
3. Shared color-token registry/theming abstraction (`token -> display hex`) across tasks.
   1. Handling now: keep `display.textColorByToken` in Stroop config.
4. Shared reaction-time task base adapter (fixation->stimulus->response->feedback lifecycle).
   1. Handling now: implement lightweight Stroop-local flow, reusing existing core primitives only.

These are intentionally not promoted to core in v1 to keep scope controlled; they are logged as follow-up refactor candidates after Stroop stabilizes.

## Assumptions and Defaults Chosen
1. Congruence uses classic semantic rule (confirmed).
2. Condition balancing uses exact quotas (confirmed).
3. `"blue"` acts as neutral in classic setup unless explicitly remapped.
4. Color tokens map to actual CSS colors through config (`textColorByToken`), not hardcoded CSS names.
5. Runner implementation is jsPsych-only in v1 for fastest integration; native runner can be added later if needed.
6. Emotional mode replaces congruence manipulation with valence manipulation while keeping color-based response mapping.
7. Blocks are identical in structure and quota targets; randomization still varies trial order by seeded block RNG.
