# Implementation Plan - Architectural Streamlining and Complexity Reduction

## Phase 1: Foundation and Shared Lifecycle
- [x] Task: Define a standardized `TaskAdapter` interface and lifecycle in `@experiments/core` (2cd1f7d)
    - [x] Write unit tests for the `TaskAdapter` interface and lifecycle manager
    - [x] Implement the `TaskAdapter` base class/interface
    - [x] Implement a `LifecycleManager` to handle initialization, execution, and termination
- [x] Task: Consolidate common utility functions from task adapters into `packages/core/src/utils` (e378187)
    - [x] Identify redundant utilities in `tasks/pm/src`, `tasks/sft/src`, etc.
    - [x] Write unit tests for the consolidated utilities in `packages/core`
    - [x] Migrate utilities and update existing tasks to use core versions
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation and Shared Lifecycle' (Protocol in workflow.md)

## Phase 2: Core Module Refactoring
- [x] Task: Refactor the `ConfigurationManager` in `@experiments/core` to reduce complexity (0cb2148)
    - [x] Write unit tests for the refactored `ConfigurationManager` (including inheritance and overrides)
    - [x] Simplify the config merging and validation logic
- [x] Task: Flatten core module dependencies to eliminate circularity and deep nesting (0cb2148)
    - [x] Analyze current dependency graph (using `madge` or similar if available)
    - [x] Reorganize core modules to follow a clearer, flatter structure
- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Module Refactoring' (Protocol in workflow.md) - SKIPPED by user

## Phase 3: Web Shell and PM Task Integration
- [x] Task: Streamline the `apps/web` task loading and configuration handling (0e3851a)
    - [x] Write integration tests for explicit task loading in the shell
    - [x] Refactor the shell to use the new `LifecycleManager` and standardized `TaskAdapter`
- [x] Task: Update the `pm` task to implement the new standardized `TaskAdapter` interface (0e3851a)
    - [x] Refactor `tasks/pm/src/index.ts` to adhere to the new lifecycle
    - [x] Ensure all existing `pm` tests pass and the task functions correctly in the new shell
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Web Shell and PM Task Integration' (Protocol in workflow.md)

## Phase 4: Migration and Documentation
- [~] Task: Migrate remaining task adapters (`sft`, `nback`, etc.) to the new architecture (Clean Break)
    - [ ] Refactor each task adapter to implement the new `TaskAdapter` interface
    - [ ] Verify each migrated task in the unified shell
- [ ] Task: Update project documentation and remove legacy systems
    - [ ] Update `CORE_API.md` with new lifecycle and utility details
    - [ ] Update `TASK_<NAME>.md` templates
    - [ ] Remove any deprecated or redundant code from the monorepo
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Migration and Documentation' (Protocol in workflow.md)
