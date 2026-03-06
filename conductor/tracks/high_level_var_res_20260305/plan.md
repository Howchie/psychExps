# Implementation Plan - High-Level Variable Resolution

## Phase 1: Core Framework Enhancement [checkpoint: c7fd913]
- [x] Task: Implement high-level configuration resolution in `@experiments/core` (9f87e80)
    - [x] Write unit tests for recursive configuration resolution
    - [x] Enhance `ConfigurationManager` to support variable resolution after merging
    - [x] Update `LifecycleManager` to ensure resolution occurs before `TaskAdapter.initialize`
    - [x] Standardize `VariableResolver` instantiation using `SelectionContext`
- [x] Task: Conductor - User Manual Verification 'Phase 1: Core Framework Enhancement' (Protocol in workflow.md)

## Phase 2: Task Adapter Refactoring (Batch 1) [checkpoint: 294095a]
- [x] Task: Refactor `pm` task adapter to remove local variable resolution (2fca233)
    - [x] Write unit tests for `pm` adapter config parsing without local resolver
    - [x] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/pm/src/index.ts`
- [x] Task: Refactor `sft` task adapter to remove local variable resolution (117049a)
    - [x] Write unit tests for `sft` adapter config parsing without local resolver
    - [x] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/sft/src/index.ts`
- [x] Task: Refactor `nback` task adapter to remove local variable resolution (117049a)
    - [x] Write unit tests for `nback` adapter config parsing without local resolver
    - [x] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/nback/src/index.ts`
- [x] Task: Conductor - User Manual Verification 'Phase 2: Task Adapter Refactoring (Batch 1)' (Protocol in workflow.md)

## Phase 3: Task Adapter Refactoring (Batch 2) [checkpoint: 31fa28a]
- [x] Task: Refactor remaining task adapters (`bricks`, `stroop`, `tracking`) (fa8f8e3)
    - [x] Remove redundant resolution logic from `tasks/bricks/src/index.ts`
    - [x] Remove redundant resolution logic from `tasks/stroop/src/index.ts`
    - [x] Remove redundant resolution logic from `tasks/tracking/src/index.ts`
- [x] Task: Conductor - User Manual Verification 'Phase 3: Task Adapter Refactoring (Batch 2)' (Protocol in workflow.md)

## Phase 4: Final Validation and Documentation [checkpoint: c271ab6]
- [x] Task: Verify end-to-end functionality in the unified browser shell
    - [x] Confirm `pm modern` correctly resolves and displays stimuli
    - [x] Verify other tasks load and run correctly with high-level resolution
- [x] Task: Update project documentation (3c9de83)
    - [x] Update `CORE_API.md` to reflect the new configuration resolution process
    - [x] Remove variable resolution sections from `TASK_<NAME>.md` files where applicable
- [x] Task: Conductor - User Manual Verification 'Phase 4: Final Validation and Documentation' (Protocol in workflow.md)
