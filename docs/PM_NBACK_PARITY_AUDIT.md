# PM vs NBack+Module Parity Audit (Current State)

Date: 2026-03-10

## Scope

Compared code paths:
- Standalone PM task: `tasks/nback_pm_old/src/index.ts`
- Canonical PM-integration target: NBack + core PM module
  - `tasks/nback/src/index.ts`
  - `packages/core/src/engines/prospectiveMemory.ts`

Intent:
- Standalone PM is parity harness/deprecation path.
- NBack + core PM module is the canonical integration direction.

## Parity Summary

1. Core scaffolding parity: partial
- NBack now runs PM via core module orchestration (`startScopedModules`/`stopScopedModules`).
- PM task remains standalone task-local planner/runtime.

2. Behavioral parity: partial
- PM-slot insertion exists in both paths.
- Critical semantics differ in scheduling, key policy, and output format (details below).

3. Output parity: improved, still partial
- Standalone PM exports PM trial records directly.
- NBack now includes PM trials in primary records/CSV, reducing split-output friction.
- Remaining difference: standalone PM and NBack still differ in some field-level semantics/labels and PM-block metadata conventions.

## Detailed Findings

### A. PM slot scheduling semantics differ (high impact)

Standalone PM:
- Uses explicit block PM controls (`pmCount`, `minPmSeparation`, `maxPmSeparation`) with hard guarantees.
- See `generatePmPositions` and validation in:
  - `tasks/nback_pm_old/src/index.ts` (block plan build + integrity checks).

NBack + module:
- Uses core module `generateProspectiveMemoryPositions`.
- PM positions are generated directly against eligible indices (`eligibleTrialTypes`).
- Count and spacing are enforced, but edge semantics (for example first-eligible position policy and collision constraints) still differ from standalone PM.
- See:
  - `packages/core/src/engines/prospectiveMemory.ts` (`transformBlockPlan`).

### B. PM key gating parity improved (low impact)

Standalone PM:
- PM blocks allow PM key; control blocks disallow PM key.
- Implemented via block-type aware key resolution.

NBack + module:
- Runtime key set now includes PM keys only for blocks that actually contain PM trials.
- Remaining gap is explicit PM-vs-control block contract, not key activation itself.

### C. Trial typing/plan semantics differ (medium impact)

Standalone PM:
- Explicit `blockType: PM|Control`.
- Explicit control-block remap behavior and PM-aware validation.

NBack + module:
- PM module rewrites trials to `trialType: "PM"` where selected.
- No built-in notion of PM-vs-control block semantics in module itself.
- Control-remap semantics are config/task-level, not module-level parity.

### D. Record/output schema differs (medium impact)

Standalone PM:
- CSV rows are PM-native (`phase === "pm_response_window"`).
- PM trials are first-class in exported records.

NBack + module:
- PM trials are now first-class in primary NBack records/CSV.
- DRT scope payload is isolated to DRT module results only (no PM-module leakage under DRT keys).
- Remaining differences are schema-level naming/semantics, not a hard PM-vs-main output split.

### E. Instruction parity differs (medium impact)

Standalone PM:
- PM-specific intros/block templates are first-class and task-owned.

NBack + module:
- Shared instruction helpers are used.
- PM intro affordances are available in NBack config, but standalone PM wording/ordering is not guaranteed 1:1.

## What Is Already Converged

1. Module lifecycle ownership is core-owned in NBack (`TaskModuleRunner` scoped start/stop).
2. PM transform hook surface is reusable through the shared PM module API.
3. Canonical integration path no longer depends on standalone PM runtime internals.

## Remaining Work To Reach Practical Parity

1. Module scheduler guarantees
- Make PM placement honor requested count/separation after `eligibleTrialTypes` filtering.

2. PM response policy contract
- Define block-level PM key policy contract for NBack+module parity mode.

3. Output adapter
- Add optional PM-parity export mode from NBack payload:
  - PM trial rows aligned with standalone PM schema, or
  - documented converter utility from `jsPsychData + moduleResults`.

4. Config contract normalization
- Decide canonical PM config surface:
  - keep rule-based module config only, or
  - provide compatibility mapping from PM task-style fields.

5. Parity test harness
- Add deterministic parity fixtures comparing:
  - PM slot indices
  - response correctness classification
  - exported row-level PM metrics

## Recommendation

Treat NBack+module as canonical, but keep standalone PM unchanged as parity harness until:
1. scheduling guarantee parity and
2. output schema parity (or documented migration converter)
are both in place and verified.
