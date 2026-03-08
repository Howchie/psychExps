# Specification: Core Adoption and Redundancy Removal (Track: core_adoption_unification_20260306)

## Overview
This track converts the architecture audit findings into implementation work. The objective is to eliminate task-local systems that duplicate core capabilities and to complete migration to shared core flows where those flows already exist.

This is a core-first refactor track. Changes must preserve behavior unless explicitly documented and approved.

## Problem Statement
The codebase currently contains multiple "core exists but task still uses task-local implementation" paths:
- Bricks maintains task-local scheduler/RNG/CSV systems despite core equivalents.
- PM/SFT/Stroop still hand-roll jsPsych continue/instruction flow that is already abstracted in core.
- Standalone PM remains as an intentional parity harness while the canonical PM runtime path is NBack + core PM module.
- Repo hygiene includes task-local dependency/checkpoint artifacts that amplify drift and review noise.
- Existing unification docs/plans are not yet reflected in task/runtime implementation state.

## Goals
1. Remove direct duplication where a core implementation already exists.
2. Standardize task adapters on shared lifecycle/instruction/module orchestration APIs.
3. Preserve config backward compatibility while moving toward canonical core config paths.
4. Reduce maintenance surface area and improve testability by consolidating logic in core.
5. Align docs with actual runtime behavior and migration status.

## Non-Goals
1. Rewriting task-specific paradigm semantics (stimulus/scoring logic that is irreducibly local).
2. Large visual/UI redesign.
3. Breaking config changes without compatibility handling or migration notes.

## Functional Requirements

### FR1: Remove Bricks Local Forks That Duplicate Core
1. Replace Bricks local scheduler usage with `@experiments/core` scheduler API.
2. Remove unused or redundant local scheduler implementation in Bricks runtime.
3. Replace Bricks local CSV serializer with core `recordsToCsv` (or extend core formatter if Bricks-specific shape is required).
4. Consolidate Bricks RNG/sampling usage onto core random/sampling primitives, introducing core adapters only when needed.

### FR2: Standardize jsPsych Continue/Instruction Flow Usage
1. PM/SFT/Stroop must migrate manual continue-screen loops to core jsPsych helpers where behavior matches:
   - `appendJsPsychContinuePages`
   - `resolveInstructionFlowPages`
   - shared instruction/task UI flow helpers as applicable
2. Any residual task-local wrappers must be justified as irreducibly task-specific and documented.

### FR3: PM Canonicalization and Parity Governance
1. Treat NBack + core PM module as the canonical production PM runtime path.
2. Treat standalone PM task as parity validation harness only (no net-new feature ownership).
3. Maintain parity validation criteria and evidence between standalone PM harness and canonical path.
4. Define retirement/archive gate for standalone PM once parity confidence thresholds are met.

### FR4: Complete Cross-Task Module/Lifecycle Convergence
1. Ensure each task uses shared core lifecycle/session primitives where available.
2. Minimize task-local module orchestration wrappers (DRT/PM/etc.) when core runner and scope model can represent behavior.
3. Keep task adapters thin around paradigm-only logic.

### FR5: Repo Hygiene and Drift Reduction
1. Remove committed task-local `node_modules` trees under task directories.
2. Remove committed checkpoint artifacts that duplicate source logic.
3. Add/adjust ignore rules if needed to prevent recurrence.

### FR6: Documentation and Plan Alignment
1. Update docs to reflect actual migration state and canonical APIs.
2. Keep architecture and conductor plans synchronized with implementation status.
3. Document any remaining intentional task-local implementations and why they are irreducible.

## Success Criteria
1. No active task code path depends on Bricks task-local scheduler fork.
2. Bricks no longer maintains task-local CSV and RNG systems when core equivalents satisfy requirements.
3. PM/SFT/Stroop instruction/continue flows use core helpers for common cases.
4. PM runtime ownership is explicit: canonical path is NBack + core PM module; standalone PM is documented as parity-only.
5. Parity gate criteria for standalone PM are documented and reproducible.
6. Task-local dependency/checkpoint artifact drift is removed and guarded.
7. Typecheck passes for core and all affected task packages.
8. Auto-responder runs succeed for impacted task variants with no behavioral regressions beyond approved changes.

## Constraints
1. Backward compatibility is required for live/legacy configs unless explicit migration steps are provided.
2. Refactors must remain additive and staged, with verification checkpoints.
3. Changes must follow AGENTS.md core-first design policy.
