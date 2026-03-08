# Implementation Plan: Core Adoption and Redundancy Removal (Track: core_adoption_unification_20260306)

## Closure Note (2026-03-08)
- Track closed by decision after module/lifecycle convergence and auto-responder smoke checks.
- Remaining PM parity governance items are intentionally deferred to a dedicated follow-up parity track.

## Phase 0: Baseline and Guardrails
- [ ] Task: Confirm and snapshot current duplication hotspots
  - [ ] Bricks scheduler fork vs core scheduler
  - [ ] Bricks local CSV path vs core data CSV
  - [ ] Bricks local RNG path vs core random/sampling
  - [ ] PM/SFT/Stroop manual jsPsych continue loops vs core jsPsych helpers
  - [ ] PM vs NBack/core PM module overlap map
- [ ] Task: Define regression verification matrix
  - [ ] Affected task variants and expected output invariants
  - [ ] Auto-responder verification flow per task
- [ ] Task: Conductor - User Manual Verification 'Phase 0 Baseline' (Protocol in workflow.md)

## Phase 1: Bricks Deduplication (Highest Confidence Wins)
- [x] Task: Remove Bricks scheduler fork and route to core scheduler
  - [x] Replace imports/usages with `@experiments/core` scheduler exports
  - [x] Delete deprecated local scheduler file if fully unused
  - [ ] Add/update tests covering Bricks scheduling behavior parity
- [x] Task: Replace Bricks local CSV serialization with core path
  - [x] Use core `recordsToCsv` or extend core serializer for Bricks-specific formatting requirements
  - [x] Remove local `csvCell`/`recordsToCsv` duplication from Bricks adapter
- [x] Task: Consolidate Bricks RNG to core random/sampling APIs
  - [x] Introduce minimal core adapters only if Bricks needs additional RNG surface
  - [x] Remove task-local RNG implementation if no irreducible behavior remains
- [x] Task: Typecheck/tests for core + Bricks
  - [x] `npm run test -w @experiments/core`
  - [x] `npm run typecheck -w @experiments/core`
  - [x] `npm run typecheck -w @experiments/task-bricks`
- [ ] Task: Conductor - User Manual Verification 'Phase 1 Bricks Deduplication' (Protocol in workflow.md)

## Phase 2: Shared jsPsych Instruction/Continue Flow Adoption
- [x] Task: PM migration to core jsPsych continue helpers
  - [x] Out of scope by policy: standalone PM is parity harness and receives no net-new feature/refactor work.
- [x] Task: Introduce shared instruction screen scheduler across native and jsPsych
  - [x] Core `instructionFlow` now exports reusable instruction screen builder/renderer primitives.
  - [x] Core jsPsych flow now consumes the same instruction screen builder used by native `runInstructionScreens`.
  - [x] Core now exposes shared task-intro and block-intro card renderers used by both native (`taskUiFlow`) and jsPsych helpers.
- [x] Task: SFT migration to core jsPsych continue helpers
  - [x] Convert block pre/post instruction loops to shared helper calls (`appendJsPsychInstructionScreens`)
  - [x] Convert task intro start and block intro cards to shared core helpers
  - [x] Add block-intro change detection guard to avoid redundant repeated intro cards
  - [x] Convert remaining intro/instruction continue screens to shared helpers where practical
  - [x] Keep paradigm-specific copy only where necessary
- [x] Task: Stroop migration to core jsPsych continue helpers
  - [x] Convert block pre/post instruction loops to shared helper calls (`appendJsPsychInstructionScreens`)
  - [x] Convert task intro start and block intro cards to shared core helpers
  - [x] Add block-intro change detection guard to avoid redundant repeated intro cards
  - [x] Convert remaining intro/instruction continue screens to shared helpers where practical
  - [x] Preserve existing event timing and metadata fields
- [x] Task: NBack migration to core jsPsych instruction helper
  - [x] Convert intro/pre/post/end instruction page scheduling to `appendJsPsychInstructionScreens`
  - [x] Migrate participant-intro and block-intro screens to core jsPsych helpers (`appendJsPsychTaskIntroScreen`, `appendJsPsychBlockIntroScreen`)
  - [x] Add block-intro change detection guard to avoid redundant repeated intro cards
  - [x] Convert PM template intro page to shared helper; keep block-end summary bespoke (task-specific metric view)
- [ ] Task: Typecheck/tests for core + PM/SFT/Stroop
  - [x] `npm run typecheck -w @experiments/core`
  - [x] `npm run typecheck -w @experiments/task-nback-pm-old`
  - [x] `npm run typecheck -w @experiments/task-sft`
  - [x] `npm run typecheck -w @experiments/task-stroop`
  - [x] `npm run test -w @experiments/task-nback-pm-old`
  - [x] `npm run test -w @experiments/task-sft`
  - [x] `npm run test -w @experiments/task-stroop`
- [ ] Task: Conductor - User Manual Verification 'Phase 2 jsPsych Flow Adoption' (Protocol in workflow.md)

## Phase 3: PM Canonicalization and Parity Governance
- [ ] Task: Codify runtime ownership
  - [ ] Canonical PM runtime path: NBack + core PM module
  - [ ] Standalone PM role: parity harness only
  - [ ] Mark no-net-new-feature policy for standalone PM path
- [ ] Task: Define parity gate protocol between standalone PM and canonical path
  - [ ] Feature parity checklist
  - [ ] Output/metric parity tolerances
  - [ ] Variant/config coverage for parity runs
- [ ] Task: Implement parity evidence workflow
  - [ ] Add or update parity tests/smoke scripts
  - [ ] Persist parity run summaries in docs or test artifacts
- [ ] Task: Define standalone PM retirement/archive criteria
  - [ ] Required consecutive parity passes
  - [ ] Stability window and sign-off criteria
  - [ ] Archive/deprecation execution steps
- [ ] Task: Typecheck/tests for core + PM harness + NBack canonical path
  - [x] `npm run typecheck -w @experiments/core`
  - [x] `npm run typecheck -w @experiments/task-nback-pm-old`
  - [x] `npm run typecheck -w @experiments/task-nback`
- [ ] Task: Conductor - User Manual Verification 'Phase 3 PM Canonicalization and Parity Governance' (Protocol in workflow.md)

## Phase 4: Lifecycle/Module Convergence Across Remaining Tasks
- [ ] Task: Audit and reduce task-local module orchestration wrappers
  - [x] Bricks DRT wrapper scope handling (incremental): removed redundant block scope map and unified deterministic scope-id path
  - [x] Bricks DRT wrapper scope handling (remaining): extracted final direct start/stop calls to shared core `startDrtModuleScope`/`stopModuleScope` helper while preserving controller-binding semantics
  - [x] Tracking/NBack scope handling consistency: both now use shared core DRT scope start/stop helper
  - [x] Remove task-owned module runner instances in Bricks/Tracking; both now use core-provided `context.moduleRunner`
  - [x] NBack PM orchestration converged to a single core-owned runtime path (`startScopedModules`/`stopScopedModules`), removing manual `new ProspectiveMemoryModule()` runtime start
  - [x] Any remaining direct module bootstrap/teardown paths: none found in `tasks/*/src/index.ts` after migration audit
- [ ] Task: Move common orchestration deltas to core session/lifecycle utilities
  - [x] Preserve renderer-specific behavior boundaries (shared helper only abstracts module scope bootstrap/teardown; task render contexts remain local)
  - [x] Consolidate Bricks instruction page resolution/render wrapper with shared instruction flow primitives where behavior allows
  - [x] Rebuild Bricks dist after runtime dedup changes to clear stale sourcemap/runtime artifact warnings in task tests
  - [x] Add tests for scope transitions (`task|block|trial`) and cleanup guarantees
- [x] Task: Typecheck/tests for all impacted task packages
  - [x] `npm run typecheck -w @experiments/core`
  - [x] `npm run typecheck -w @experiments/task-bricks`
  - [x] `npm run typecheck -w @experiments/task-change-detection`
  - [x] `npm run typecheck -w @experiments/task-tracking`
  - [x] `npm run typecheck -w @experiments/task-nback`
  - [x] `npm run typecheck -w @experiments/task-nback-pm-old`
  - [x] `npm run typecheck -w @experiments/task-sft`
  - [x] `npm run typecheck -w @experiments/task-stroop`
  - [x] `npm run test -w @experiments/core`
  - [x] `npm run test -w @experiments/task-bricks`
  - [x] `npm run test -w @experiments/task-change-detection`
  - [x] `npm run test -w @experiments/task-nback`
  - [x] `npm run test -w @experiments/task-nback-pm-old`
  - [x] `npm run test -w @experiments/task-sft`
  - [x] `npm run test -w @experiments/task-stroop`
  - [x] `npm run test -w @experiments/task-tracking`
- [ ] Task: Conductor - User Manual Verification 'Phase 4 Lifecycle Convergence' (Protocol in workflow.md)

## Phase 5: Repository Hygiene and Drift Controls
- [x] Task: Remove task-local committed dependencies (`tasks/*/node_modules`)
- [x] Task: Remove committed checkpoint source artifacts (e.g., `.ipynb_checkpoints`)
- [x] Task: Harden ignore patterns to prevent recurrence
- [x] Task: Verify workspace install/build still resolves cleanly from root
- [ ] Task: Conductor - User Manual Verification 'Phase 5 Repository Hygiene' (Protocol in workflow.md)

## Phase 6: Documentation and Contract Sync
- [x] Task: Update architecture/unification docs to reflect implemented state
  - [x] `docs/architecture_unification_audit_plan.md`
  - [x] `docs/CORE_API.md`
  - [x] impacted `docs/TASK_*.md`
- [x] Task: Update config examples for migrated canonical paths
  - [x] `configs/*` examples tied to module and instruction flow changes
- [x] Task: Capture residual irreducible task-local systems and rationale
- [ ] Task: Conductor - User Manual Verification 'Phase 6 Documentation Sync' (Protocol in workflow.md)

## Exit Criteria
- [ ] All phase verification checkpoints complete
- [x] Typecheck green for core and all affected tasks
- [ ] Auto-responder smoke verification complete for impacted variants
- [ ] No confirmed "core exists but task-local duplicate still active" cases in scoped systems
