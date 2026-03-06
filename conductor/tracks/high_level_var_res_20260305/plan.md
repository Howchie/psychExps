# Implementation Plan - High-Level Variable Resolution

## Phase 1: Core Framework Enhancement
- [x] Task: Implement high-level configuration resolution in `@experiments/core` (9f87e80)
    - [x] Write unit tests for recursive configuration resolution
    - [x] Enhance `ConfigurationManager` to support variable resolution after merging
    - [x] Update `LifecycleManager` to ensure resolution occurs before `TaskAdapter.initialize`
    - [x] Standardize `VariableResolver` instantiation using `SelectionContext`
- [~] Task: Conductor - User Manual Verification 'Phase 1: Core Framework Enhancement' (Protocol in workflow.md)

## Phase 2: Task Adapter Refactoring (Batch 1)
- [ ] Task: Refactor `pm` task adapter to remove local variable resolution
    - [ ] Write unit tests for `pm` adapter config parsing without local resolver
    - [ ] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/pm/src/index.ts`
- [ ] Task: Refactor `sft` task adapter to remove local variable resolution
    - [ ] Write unit tests for `sft` adapter config parsing without local resolver
    - [ ] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/sft/src/index.ts`
- [ ] Task: Refactor `nback` task adapter to remove local variable resolution
    - [ ] Write unit tests for `nback` adapter config parsing without local resolver
    - [ ] Remove `VariableResolver` and `resolveWithVariables` calls from `tasks/nback/src/index.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Task Adapter Refactoring (Batch 1)' (Protocol in workflow.md)

## Phase 3: Task Adapter Refactoring (Batch 2)
- [ ] Task: Refactor remaining task adapters (`bricks`, `stroop`, `tracking`)
    - [ ] Remove redundant resolution logic from `tasks/bricks/src/index.ts`
    - [ ] Remove redundant resolution logic from `tasks/stroop/src/index.ts`
    - [ ] Remove redundant resolution logic from `tasks/tracking/src/index.ts`
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Task Adapter Refactoring (Batch 2)' (Protocol in workflow.md)

## Phase 4: Final Validation and Documentation
- [ ] Task: Verify end-to-end functionality in the unified browser shell
    - [ ] Confirm `pm modern` correctly resolves and displays stimuli
    - [ ] Verify other tasks load and run correctly with high-level resolution
- [ ] Task: Update project documentation
    - [ ] Update `CORE_API.md` to reflect the new configuration resolution process
    - [ ] Remove variable resolution sections from `TASK_<NAME>.md` files where applicable
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Validation and Documentation' (Protocol in workflow.md)
