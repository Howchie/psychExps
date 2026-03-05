# PM vs NBack Parity Audit (Pre-Extraction)

Date: 2026-03-05

## Scope

This audit compares:
- Current integrated PM task: `tasks/pm/src/index.ts`
- Standalone NBack task: `tasks/nback/src/index.ts`

Goal: identify parity gaps before extracting and integrating a reusable PM module path into NBack, while leaving the existing PM task unchanged.

## PM capabilities present in current PM task

1. Block-level PM mode (`blockType: PM|Control`).
2. Dedicated PM response key (`mapping.pmKey`) with distinct key mapping checks.
3. PM slot scheduling with separation constraints (`pmCount`, `minPmSeparation`, `maxPmSeparation`).
4. Category-driven PM stimuli selection with independent PM item/category draw controls.
5. Control-slot remapping behavior for control blocks.
6. PM-aware integrity checks (PM vs n-back match constraints).
7. PM-specific instruction templates (`pmTemplate`, PM/control block intro templates, ordering flags).
8. Block-level allowed key policy (PM blocks allow PM key; control blocks do not).

## NBack gaps before this extraction pass

1. No PM key/mapping category.
2. No PM slot generation/separation logic.
3. No PM category draws for PM trials.
4. No PM/control block semantics in planner.
5. No PM-aware integrity checks.
6. No PM/control intro template support.
7. No PM block-level key gating.
8. No PM metadata in finalized payload.

## Changes implemented in this pass

1. Added shared core PM utilities:
   - `packages/core/src/prospectiveMemory.ts`
   - Includes PM slot scheduling (`generateProspectiveMemoryPositions`) and generic cue-rule matching primitives.

2. Extended NBack planning/runtime for PM-module behavior (additive, backward-compatible):
   - Optional `mapping.pmKey`.
   - Block fields: `blockType`, `activePmCategories`, `controlSourceCategories`, `pmCount`, `minPmSeparation`, `maxPmSeparation`.
   - PM slot generation and insertion in planner.
   - PM/control remap behavior.
   - PM-aware block validation.
   - PM/control block intro templates and intro ordering flags.
   - Block-level allowed-key policy including PM key only in PM blocks.
   - Trial/event records now include `blockType`.

3. Added NBack PM demo variant:
   - `configs/nback/pm_module_demo.json`
   - registered as `pm_module_demo` in NBack manifest.

## Non-goals in this pass

1. No modifications to `tasks/pm/src/index.ts` behavior.
2. No migration of deployed PM task runtime to the extracted module path.
3. No removal of PM task code.

## Remaining parity checks (manual runtime verification)

1. PM key only accepted in PM blocks (not control blocks).
2. PM slot spacing honors min/max separation over full blocks.
3. PM slots never overlap with n-back targets/lures after integrity checks.
4. Control-slot remap behavior matches PM task expectations.
5. Instructions order/wording parity for PM/control blocks in target configs.
6. Output-level parity for analyses that currently consume PM task records.

## Next step toward full PM modularization

Core utility extraction has now started in `packages/core/src/prospectiveMemory.ts`, and NBack consumes that path in the PM demo variant flow.
After validating `nback/pm_module_demo` behavior, continue lifting remaining PM-specific planner/evaluator pieces into that shared module path so NBack and future tasks consume a single PM runtime surface.
