# Architecture Complexity Audit
Date: 2026-03-05
Scope: `packages/core`, `apps/web`, `tasks/*` with PM task behavior preserved (no PM runtime changes proposed in this document).

## Executive Summary
The codebase has improved core reuse, but complexity is still accumulating through parallel pathways rather than replacement. The highest-risk issue is not missing abstractions; it is overlapping abstractions that coexist and partially overlap in behavior.

Top conclusions:
1. There are still multiple orchestration pathways (native, jsPsych, legacy loop helpers) with inconsistent adoption.
2. DRT integration is core-capable but repeatedly reassembled in each task adapter.
3. Core currently exports several low-usage/unused modules that increase maintenance surface.
4. Task adapters remain large “god files” mixing parse/planning/runtime/render/data concerns.
5. Instruction/navigation flow is still split across native and jsPsych helper stacks.

Net effect: higher fragility, slower extension work, and a recurring pattern where refactors add a new path without retiring the old one.

## Evidence Snapshot
- Large adapter files (single-file complexity concentration):
  - `tasks/nback/src/index.ts` (1969 LOC)
  - `tasks/tracking/src/index.ts` (1180 LOC)
  - `tasks/stroop/src/index.ts` (1106 LOC)
  - `tasks/sft/src/index.ts` (1525 LOC)
  - `tasks/bricks/src/index.ts` (720 LOC)
- Core exports broad surface (`packages/core/src/index.ts`) including modules not used by active task paths.
- DRT scoped embed wiring logic is duplicated in:
  - `tasks/nback/src/index.ts`
  - `tasks/tracking/src/index.ts`
  - `tasks/bricks/src/index.ts`

## Findings (Ordered by Severity)

### 1) Orchestration Path Duplication Persists
Severity: High

Current orchestration utilities include:
- `runTaskSession` (`packages/core/src/sessionRunner.ts`)
- `runTrialWithEnvelope` (`packages/core/src/trialExecution.ts`)
- Legacy/parallel loop stack: `runBlockTrialLoop` and `runPromptScreens` (`packages/core/src/experiment.ts`)
- Stage/timeline runner stack: `runTrialTimeline` (`packages/core/src/trial.ts`) and `runBasicRtTrial` (`packages/core/src/rtTask.ts`)

Observed use:
- `tracking`, `bricks`, `nback` use `runTaskSession`.
- `sft` and `stroop` still run bespoke jsPsych assembly loops.
- `runBlockTrialLoop`/`runPromptScreens` are currently unused by active task source files.
- `runBasicRtTrial` appears unused by task adapters.

Risk:
- New features must be threaded through multiple pathways or become task-specific.
- “Core-first” intent is undermined by unresolved legacy pathways.

### 2) NBack Uses `runTaskSession` as a Timeline Builder, Not Runtime Controller
Severity: High

In `tasks/nback/src/index.ts`, `runTaskSession` iterates blocks/trials only to append jsPsych nodes into `timeline`; actual execution happens later via `runJsPsychTimeline`.

Risk:
- Two mental models in one flow (session runner + deferred jsPsych runtime).
- Hook timing and lifecycle semantics become indirect and harder to reason about.

Recommendation:
- Introduce a dedicated jsPsych session compiler abstraction (core) and stop routing compile-time timeline generation through runtime-style `runTaskSession`.

### 3) DRT Scoped Embedding Is Centralized in Concept but Duplicated in Implementation
Severity: High

`ModuleEmbedCoordinator` is shared, but each task duplicates:
- coordinator setup
- transform persistence map keying
- `DrtController` construction
- scope start/stop wrappers
- record emission and scope-record conversion

Locations:
- `tasks/nback/src/index.ts`
- `tasks/tracking/src/index.ts`
- `tasks/bricks/src/index.ts`

Risk:
- Behavioral drift across tasks (scope semantics, event payload differences, cleanup differences).
- Any DRT evolution requires repeated edits.

Recommendation:
- Add core factory/helper for scoped DRT module embedding (one canonical constructor path).

### 4) Bricks DRT Presentation Is Overlayered
Severity: High

`tasks/bricks/src/runtime/runConveyorTrial.ts` uses:
- core `DrtController` (which already supports built-in visual/audio/border presentation), plus
- `createDrtPresentationBridge` callbacks for renderer-specific presentation.

This creates overlapping presentation responsibility and ambiguous ownership.

Risk:
- Double presentation or mode mismatch bugs.
- Harder reasoning about what actually presents stimulus (controller defaults vs bridge callbacks).

Recommendation:
- Make presentation ownership explicit in controller config:
  - either `presentation: "controller" | "external"`
  - or disable built-ins when bridge adapter is active.

### 5) Instruction Flow Is Split Across Three Parallel Mechanisms
Severity: Medium-High

Current mechanisms:
- Native flow: `instructionFlow.ts` + `taskUiFlow.ts`
- jsPsych flow helper: `jspsychContinueFlow.ts`
- direct usage of `pushJsPsychContinueScreen` / `waitForContinue` in task adapters

Tasks mix these differently (`tracking` vs `nback` vs `sft`/`stroop`).

Risk:
- Repeated instruction behavior bugs and formatting divergence.
- Inconsistent support for pre/post/end semantics.

Recommendation:
- Core instruction composer with renderer sink adapters:
  - `native sink` (direct DOM)
  - `jsPsych sink` (timeline nodes)

### 6) Core Surface Area Has Low-Usage/Legacy Exports
Severity: Medium

Examples exported from core but not used by active adapter source paths:
- `runner.ts` selection utilities (`runWithRunner`, etc.)
- `experiment.ts` legacy loop helpers
- `taskHooks.ts` hook framework (currently not consumed in tasks)
- `runBasicRtTrial` path

Risk:
- Larger public API without operational value.
- Documentation drift and false affordances.

Recommendation:
- Mark as legacy/deprecated, move behind explicit `legacy` export path, or remove after migration window.

### 7) Adapter Files Mix Too Many Responsibilities
Severity: Medium

Large task index files combine:
- config coercion
- planning/scheduling
- instruction assembly
- runtime loop/timeline construction
- drawing/rendering logic
- data extraction/export

Risk:
- High edit blast radius.
- Regression risk increases for small feature additions.

Recommendation:
- Per task, split into:
  - `config.ts`
  - `plan.ts`
  - `runtime.ts` (or `timeline.ts` for jsPsych)
  - `data.ts`
  - `index.ts` (thin adapter wiring only)

### 8) Data Contract Divergence Across Tasks
Severity: Medium

DRT and trial payload keys differ per task:
- `drtScopes` vs `drt.scopeRecords`
- block-level delta handling is task-local (`bricks`) while others record raw scope output

Risk:
- Harder downstream analytics and shared tooling.

Recommendation:
- Define one core DRT output contract for all tasks and one adapter-level metadata extension point.

### 9) Keyboard Arbitration Policy Exists in Docs More Than in Runtime Enforcement
Severity: Medium

Concurrent task/module keyboard behavior is mostly convention-based. Overlap warnings are not consistently enforced.

Risk:
- Hidden response conflicts (primary task keys vs DRT key, especially when module scope varies).

Recommendation:
- Add core runtime validator that runs once per block/trial scope start and emits warnings/errors based on strictness mode.

### 10) Tests Do Not Match Architectural Criticality
Severity: Medium

Current test surface is very limited relative to orchestration complexity.

Risk:
- Refactors to unify paths are high-risk without integration coverage.

Recommendation:
- Add minimal cross-task integration suite focused on lifecycle and module scope correctness.

## Redundant Path Inventory (Current)
1. Session orchestration: `runTaskSession` vs legacy `runBlockTrialLoop`.
2. Trial envelope execution: `runTrialWithEnvelope` vs ad-hoc try/finally in tasks.
3. Instruction flow: native flow helpers vs jsPsych helper vs direct continue screen calls.
4. DRT embedding: shared coordinator concept but per-task recreated wiring.
5. Presentation control: `DrtController` built-ins vs external bridge adapters.
6. Runner model: runner-selection framework exists, but active tasks mostly hard-code one runner path.

## Architectural Simplification Plan (Non-Destructive First)

### Phase A: Freeze and Label Legacy
1. Mark `runner.ts`, `experiment.ts` legacy helpers, and unused hook APIs as deprecated in docs and code comments.
2. Add a “single preferred path” note in core API docs for orchestration and instruction flow.

### Phase B: Consolidate DRT Integration
1. Add `createScopedDrtEmbed(...)` in core to remove per-task factory duplication.
2. Normalize DRT scope record output schema across tasks.
3. Make DRT presentation ownership explicit (`controller` vs `external`).

### Phase C: Unify Instruction Composition
1. Implement one core instruction composer.
2. Add sink adapters for native and jsPsych.
3. Migrate `nback`, `sft`, `stroop`, `bricks`, `tracking` to composer incrementally.

### Phase D: Normalize jsPsych Session Assembly
1. Add a jsPsych-specific session compiler abstraction.
2. Migrate `nback` first (already partially structured), then `sft`, then `stroop`.
3. Remove compile-time use of runtime `runTaskSession` for jsPsych timelines.

### Phase E: Adapter Decomposition
1. Split large `index.ts` files by responsibility.
2. Keep adapter entrypoints thin and declarative.

## Edge Cases to Protect During Simplification
1. DRT scope stop guarantees on interrupted/errored trials.
2. Session-persistent transform windows (`transformPersistence: "session"`) across stop/start boundaries.
3. Border targeting correctness (stimulus frame vs full viewport).
4. Keyboard conflict handling between primary task and active embeds.
5. Mixed runner tasks during transition period.

## Final Assessment
The codebase is not suffering from a lack of architecture; it is suffering from overlapping architecture layers that were added faster than legacy pathways were retired. The next successful refactor should prioritize deletion and consolidation over adding new abstractions.
