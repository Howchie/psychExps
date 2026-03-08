# Architecture Unification Audit And Plan

## Scope
This document started as an architecture audit and proposed plan. It now also tracks implementation status for the core-adoption unification track.

Status date: 2026-03-06

## Current Implementation Status (2026-03-06)

Implemented:
- Core module lifecycle ownership converged in active paths (NBack/Bricks/Tracking) via shared `TaskModuleRunner` scope helpers.
- Bricks task-local scheduler/RNG/CSV forks removed in favor of core helpers.
- Shared instruction/page scheduling primitives now power both native and jsPsych task flows.
- SFT/Stroop/NBack instruction+continue flows moved onto shared core jsPsych helpers.
- Root workspace build/typecheck/tests pass after unification and hygiene updates.
- Repository hygiene controls added:
  - tracked task-local `node_modules` and checkpoint artifacts removed
  - ignore rules added to prevent recurrence

Still intentionally open / deferred:
- Standalone PM remains a parity harness and is not being feature-developed.
- Full PM parity governance (formal gates/evidence workflow) remains open.
- Some manual verification checkpoints are pending due unavailable manual runtime pass.

## Audit Outcome
Tracking was the initial migration testbed; this is now reflected in implemented module-scope and lifecycle convergence work.

## Where Dual Flows Exist Today

1. Task runtime/orchestration split
- jsPsych timeline tasks: PM/NBack/SFT/Stroop
  - `/data/work/Experiments/tasks/nback_pm_old/src/index.ts`
  - `/data/work/Experiments/tasks/nback/src/index.ts`
  - `/data/work/Experiments/tasks/sft/src/index.ts`
  - `/data/work/Experiments/tasks/stroop/src/index.ts`
- Native runtime tasks: Bricks/Tracking
  - `/data/work/Experiments/tasks/bricks/src/index.ts`
  - `/data/work/Experiments/tasks/tracking/src/index.ts`

2. Instruction/navigation split
- jsPsych tasks use `pushJsPsychContinueScreen` + call-function timeline nodes.
- Native tasks use direct `waitForContinue` loops.
- Tracking currently hand-rolls full instruction/block sequencing in task-local code.

3. Block/trial lifecycle split
- Bricks uses core `runBlockTrialLoop`.
  - `/data/work/Experiments/packages/core/src/experiment.ts`
- Tracking reimplements block/trial envelopes manually.
- jsPsych tasks each construct lifecycle in local timeline assembly.

4. DRT split
- Core `DrtController` used by tracking and nback.
  - `/data/work/Experiments/packages/core/src/drtController.ts`
- Bricks still has task-local DRT wrapper/presentation path.
  - `/data/work/Experiments/tasks/bricks/src/runtime/drt.ts`
  - `/data/work/Experiments/tasks/bricks/src/runtime/runConveyorTrial.ts`
- PM/SFT/Stroop do not share module-level DRT embed lifecycle yet.

5. Config parsing/coercion split
- Large task-local parsers duplicate common patterns:
  - instruction slots
  - block pre/post screens
  - alias handling
  - timing coercion
  - DRT override coercion

6. Docs/runtime mismatch
- Docs reference runner-selection APIs (`runWithRunner`) not present in source.
  - `/data/work/Experiments/docs/CORE_API.md`
  - `/data/work/Experiments/docs/TASK_PM.md`
- Current adapters hardwire one runtime path in `launch()`.

## Which Path Is Feature-Rich

1. General task orchestration richness: PM/NBack jsPsych path
- richest planning semantics, variable/manipulation handling, instruction flow, feedback and trial structure.

2. DRT richness: Tracking/NBack path
- scope control (`block`/`trial`), transform persistence (`scope`/`session`), multi-mode stimuli (visual/audio/border).

3. Native rendering richness: Bricks runtime
- robust game-loop and PIXI runtime behavior.

## Unification Principle
Core-first in this repository should be interpreted as:
- work in one task should directly benefit all tasks, regardless of renderer or local paradigm semantics.

Renderer choice remains task-local. Deployment framework (instructions, navigation, trial/block lifecycle, module embeds, finalization) should be shared.

## Detailed Implementation Plan (Historical + Remaining)

1. Define unified core deployment contract
- Introduce a core `TaskSessionRunner` contract:
  - `intro -> blocks -> trials -> block outro -> task outro -> finalize`
- Keep renderer/runtime backend task-chosen.
- Standardize event schema for `task/block/trial/module` lifecycle.

2. Tracking-first extraction
- Lift tracking’s orchestration shell into core:
  - instruction sequencing
  - block/trial loop
  - scoped module start/stop
  - lifecycle event emission
- Keep tracking-specific trial executors local (pursuit/MOT motion + rendering).
- Tracking becomes first consumer of unified lifecycle runner.

3. Core module embedding layer
- Add core embed manager with scopes:
  - `task | block | trial`
- First module target: DRT (`DrtController`).
- Add key arbitration policy in core for concurrent keyboard-capable modules.

4. Unify DRT config + lifecycle
- Extract duplicated DRT coercion from tracking/nback into core.
- Move bricks toward core DRT lifecycle; keep bricks-specific rendering hooks local.
- Preserve support for transforms and row-aligned estimate output.

5. Unify instruction/navigation
- Add core `InstructionFlow` for:
  - intro
  - pre-block
  - post-block
  - end
  - templated block intro strings
- jsPsych tasks consume via bridge nodes.
- Native tasks consume via direct `waitForContinue` backend.

6. Unify block/trial orchestration
- Expand core orchestrator to support:
  - native async trial executors
  - jsPsych timeline-backed trial executors through adapter bridge
- Remove task-local duplication of lifecycle envelopes.

7. Incremental task migration order
- Step 1: tracking (testbed)
- Step 2: nback (closest DRT overlap)
- Step 3: pm (deployment-critical, richest semantics)
- Step 4: sft and stroop
- Step 5: bricks DRT lifecycle alignment where safe

8. Config and docs alignment
- Preserve backward-compatible aliases.
- Either reactivate real runner selection, or deprecate/remove misleading `runner`/`implementation` config keys.
- Update docs to reflect actual behavior and migration status.

9. AGENTS.md policy refinement
- Add explicit statement:
  - core-first means cross-task utility, not folder placement.
- Add gate:
  - if a feature exists in only one runtime path, plan cross-path exposure before merge.
- Add rule:
  - avoid new task-local lifecycle orchestration unless irreducibly paradigm-specific.

10. Validation plan
- Typecheck affected packages.
- Replay golden configs for PM/NBack/Tracking/Bricks.
- Verify output compatibility and DRT metric parity.
- Add tests for lifecycle scopes and module embedding behavior (coverage is currently minimal).

## Edge Cases To Explicitly Cover

1. Key ownership conflicts (primary task keys vs DRT keys vs response-finish keys).
2. Withheld-response correctness while concurrent DRT is active.
3. Transform window persistence across scope stop/start boundaries.
4. Border stimulus anchoring to true stimulus frame during resize/fullscreen.
5. Native-loop timing drift and sample-rate variance.
6. Audio autoplay limitations for auditory DRT.
7. Cleanup guarantees on early exit/failure with active scopes.
8. Backward-compatible alias and coercion behavior.
9. Completion/redirect parity across runtime paths.
10. Cursor visibility policy per phase and per task mode.

## Notes
- Tracking DRT orchestration is currently more complete than most jsPsych task integrations and should be used as the baseline contract for module embedding behavior.
- PM remains the strongest reference for feature-rich trial pipeline semantics and should guide parity requirements during migration.

## Residual Task-Local Systems (Intentional, With Rationale)

1. Bricks renderer/game loop internals (`tasks/bricks/src/runtime/*`)
- Rationale: paradigm-specific PIXI runtime and conveyor mechanics are irreducible task semantics.

2. Standalone PM planner/runtime (`tasks/nback_pm_old/src/index.ts`)
- Rationale: retained as parity harness while canonical PM integration matures in NBack+module path.
- Policy: no net-new feature ownership; only stability/compatibility maintenance.

3. Task-specific scoring semantics in each adapter
- Rationale: correctness rules remain paradigm-specific even when lifecycle/orchestration is shared.
