# Implementation Plan: Standardize Modular Extensions (Track: module_unification_20260306)

## Phase 1: Core Lifecycle & Validator Updates
- [ ] Task: Implement Hard Error for Legacy Keys
    - [ ] Update core configuration validation (e.g., in `ConfigurationManager` or `core` utils) to throw if top-level `drt` or `pm` keys are found.
    - [ ] Write unit tests to verify the hard error triggers correctly.
- [ ] Task: Consolidate Module Registration
    - [ ] Ensure `LifecycleManager.run` correctly auto-registers `DrtModule`, `ProspectiveMemoryModule`, and any future modules for all tasks.
    - [ ] Verify core tests pass.
- [ ] Task: Conductor - User Manual Verification 'Core Lifecycle & Validator Updates' (Protocol in workflow.md)

## Phase 2: Configuration Migration
- [ ] Task: Migrate JSON Configuration Files
    - [ ] Find all JSON config files in `configs/` across all tasks.
    - [ ] Migrate top-level `drt` configurations into `task.modules.drt`.
    - [ ] Migrate top-level `pm` configurations into `task.modules.pm`.
- [ ] Task: Conductor - User Manual Verification 'Configuration Migration' (Protocol in workflow.md)

## Phase 3: Task Refactoring (Bricks & NBack)
- [ ] Task: Refactor Bricks Task
    - [ ] Remove `bricks` custom DRT initialization, hooks, and legacy config parsing.
    - [ ] Update `runConveyorTrial` and `runBricksTask` to rely exclusively on the `TaskAdapterContext`'s `moduleRunner`.
    - [ ] Ensure `bricks` tests pass.
- [ ] Task: Refactor NBack Task
    - [ ] Strip any remaining legacy `drt` specific block properties or parsing out of NBack, shifting it fully to `moduleRunner`.
    - [ ] Ensure NBack tests pass.
- [ ] Task: Conductor - User Manual Verification 'Task Refactoring (Bricks & NBack)' (Protocol in workflow.md)

## Phase 4: Task Refactoring (Remaining Tasks)
- [ ] Task: Refactor Stroop, Tracking, SFT, Change Detection, PM
    - [ ] Audit remaining tasks for legacy module integrations.
    - [ ] Ensure they properly utilize `TaskModuleRunner` for any modular injections.
    - [ ] Verify test suites for all modified tasks pass.
- [ ] Task: Conductor - User Manual Verification 'Task Refactoring (Remaining Tasks)' (Protocol in workflow.md)