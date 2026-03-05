# Architecture Unification Progress

This file tracks implemented migration steps from `docs/architecture_unification_audit_plan.md`.

## Completed

1. Core orchestration/session runner extraction
- `packages/core/src/sessionRunner.ts`
- `runTaskSession` is now used by:
  - `tasks/tracking/src/index.ts`
  - `tasks/nback/src/index.ts`
  - `tasks/bricks/src/index.ts`

2. Core instruction/navigation extraction (native path)
- `packages/core/src/taskUiFlow.ts`
- Used by `tracking` for intro/pre-block/post-block/end flows.

3. Core module embedding extraction
- `packages/core/src/moduleEmbedCoordinator.ts`
- `tracking` and `nback` now use coordinator-managed scoped DRT lifecycles.

4. Core trial execution envelope extraction
- `packages/core/src/trialExecution.ts`
- Used by `tracking` for per-trial lifecycle execution.

5. jsPsych continue-page helper extraction
- `packages/core/src/jspsychContinueFlow.ts`
- `nback` uses `appendJsPsychContinuePages` for intro/pre-block/post-block/end page assembly.

6. Bricks orchestration alignment (first pass)
- Replaced `runBlockTrialLoop` usage with `runTaskSession` in `tasks/bricks/src/index.ts`.
- Preserved existing Bricks start/block/trial/end behavior (same UI content and button IDs).
- Kept Bricks renderer/runtime (`runConveyorTrial`) unchanged in that pass.

7. Bricks DRT config coercion alignment
- Bricks DRT runtime now resolves config via core `coerceScopedDrtConfig`.
- This consolidates legacy key handling (`stim_type`, `response_deadline_ms`, `isi_sampler`, etc.) with the same coercion pathway used by NBack/Tracking.
- Bricks presentation/runtime hooks remain local; coercion path is shared.

8. Bricks runtime DRT mode gating alignment
- `tasks/bricks/src/runtime/runConveyorTrial.ts` now derives DRT enable/mode state from core `coerceScopedDrtConfig`.
- Visual and auditory presentation gating in Bricks trial loop now follows coerced `stimMode/stimModes` semantics, while still using Bricks-local renderer/audio presentation code.
- HUD DRT-enabled state now follows coerced `enabled` state.

9. Core DRT presentation bridge extraction
- Added `packages/core/src/drtPresentationBridge.ts` with `createDrtPresentationBridge`.
- Bridge defines callback-only presentation hooks (visual/audio/border) and mode-aware lifecycle helpers:
  - `onStimStart`
  - `onStimEnd`
  - `onResponseHandled`
  - `hideAll`
- Bricks now consumes this bridge in `tasks/bricks/src/runtime/runConveyorTrial.ts`, replacing inline mode-specific presentation branching.

10. Bricks DRT lifecycle ownership moved to core controller
- Bricks now uses core `DrtController` directly in `tasks/bricks/src/runtime/runConveyorTrial.ts`.
- Removed task-local Bricks DRT wrapper file:
  - `tasks/bricks/src/runtime/drt.ts`
- DRT start/stop/key lifecycle is now managed by core controller runtime, with Bricks providing presentation callbacks through the bridge.

11. Bricks scoped module embedding via core coordinator
- Bricks now uses core `ModuleEmbedCoordinator` in `tasks/bricks/src/index.ts` for DRT scope lifecycle (`block` and `trial`).
- Added Bricks DRT config extraction helper:
  - `tasks/bricks/src/runtime/drtConfig.ts`
- `runConveyorTrial` now supports injected scoped DRT runtime handles so scope ownership can live in coordinator while preserving Bricks-local renderer callbacks.
- Trial-scoped DRT records are finalized from coordinator snapshots and written onto trial rows (`drt`, `drt_transforms`, `drt_response_rows`).
- Block-scoped DRT is normalized to per-trial delta stats in trial rows (`drt.stats`), with cumulative snapshots retained as `drt_cumulative`.
- Final Bricks payload now includes `drtScopes` (scope-level DRT records) for cross-checking block/trial scope aggregates.

12. Core DRT scope output contract extraction
- Added `packages/core/src/drtScopeContract.ts` and core exports:
  - `DrtScopeSnapshot`
  - `DrtScopeRecord`
  - `toDrtScopeRecord(...)`
- `tracking`, `nback`, and `bricks` now use the shared core scope-record contract rather than task-local duplicate interfaces.

13. Bricks block-scoped DRT demo variant
- Added config variant:
  - `configs/bricks/drt_block_demo.json`
- Registered variant in Bricks adapter manifest:
  - `id: drt_block_demo`
- This variant is intended as a direct smoke test for block-scope DRT continuity and per-trial delta summarization.

14. PM module extraction path started (without touching PM task)
- Added shared core PM utilities:
  - `packages/core/src/prospectiveMemory.ts`
- NBack now includes additive PM-module support for:
  - PM/control block typing
  - PM slot scheduling (`pmCount`, separation constraints)
  - PM category draws and PM/control intro templates
  - PM block key gating and PM-aware validation
- Added NBack PM demo variant:
  - `configs/nback/pm_module_demo.json`
- Existing PM task (`tasks/pm`) was not modified in this pass.

## Remaining High-Value Work

1. DRT lifecycle unification for Bricks (follow-up hardening)
- Decide whether block-scoped cumulative DRT snapshot should also be written to explicit block-level summary output, not only `payload.drtScopes`.
- Add regression tests for trial-vs-block scope stats parity and mixed config warnings.

2. jsPsych lifecycle bridge generalization
- Continue lifting jsPsych timeline lifecycle assembly into shared helpers.
- Candidate next tasks: `sft`, then `stroop`, then `pm` once parity checks are ready.

3. Instruction flow normalization
- Decide whether to support rich HTML instruction page objects in shared instruction parser (`resolveInstructionFlowPages`) without breaking current string-page consumers.

4. Key arbitration policy hardening
- Current policy is now documented in `docs/CORE_API.md`.
- Next step is adding runtime validation warnings when task response keys and module keys overlap unintentionally.

5. PM module extraction path (deferred until pre-PM tasks complete)
- Extract PM logic from current PM task into a standalone embeddable module.
- Integrate that module into NBack to reproduce current PM+NBack behavior.
- Keep existing PM task intact during extraction/migration.

## Validation Status

- Typecheck passing during latest extraction cycle:
  - `@experiments/core`
  - `@experiments/task-nback`
  - `@experiments/task-tracking`
  - `@experiments/task-bricks`
