# Implementation Plan: Standardize Modular Extensions (Track: module_unification_20260306)

## Phase 1: Core Lifecycle & Validator Updates
- [x] Task: Implement Hard Error for Legacy Keys
    - [x] Update core configuration validation (e.g., in `ConfigurationManager` or `core` utils) to throw if top-level `drt` or `pm` keys are found.
    - [x] Write unit tests to verify the hard error triggers correctly.
- [x] Task: Consolidate Module Registration
    - [x] Ensure `LifecycleManager.run` correctly auto-registers `DrtModule`, `ProspectiveMemoryModule`, and any future modules for all tasks.
    - [x] Verify core tests pass.
- [x] Task: Conductor - User Manual Verification 'Core Lifecycle & Validator Updates' (Protocol in workflow.md)

## Phase 2: Configuration Migration
- [x] Task: Migrate JSON Configuration Files
    - [x] Find all JSON config files in `configs/` across all tasks.
    - [x] Migrate top-level `drt` configurations into `task.modules.drt`.
    - [x] Migrate top-level `pm` configurations into `task.modules.pm`.
- [x] Task: Conductor - User Manual Verification 'Configuration Migration' (Protocol in workflow.md)

## Phase 3: Task Refactoring (Bricks & NBack)
- [x] Task: Refactor Bricks Task
    - [x] Remove `bricks` custom DRT initialization, hooks, and legacy config parsing.
    - [x] Update `runConveyorTrial` and `runBricksTask` to rely exclusively on the `TaskAdapterContext`'s `moduleRunner`.
    - [x] Ensure `bricks` tests pass.
- [x] Task: Refactor NBack Task
    - [x] Strip any remaining legacy `drt` specific block properties or parsing out of NBack, shifting it fully to `moduleRunner`.
    - [x] Ensure NBack tests pass.
- [x] Task: Conductor - User Manual Verification 'Task Refactoring (Bricks & NBack)' (Protocol in workflow.md)

## Phase 4: Task Refactoring (Remaining Tasks)
- [x] Task: Refactor Stroop, Tracking, SFT, Change Detection, PM
    - [x] Audit remaining tasks for legacy module integrations.
    - [x] Ensure they properly utilize `TaskModuleRunner` for any modular injections.
    - [x] Verify test suites for all modified tasks pass.
- [x] Task: Conductor - User Manual Verification 'Task Refactoring (Remaining Tasks)' (Protocol in workflow.md)

## Verification Evidence
- [x] Typecheck checks passed for module-migrated tasks (`@experiments/task-nback`, `@experiments/task-tracking`, `@experiments/task-bricks`).
- [x] Auto-responder suite passed on 2026-03-08 via `npm run test:auto` (Playwright; 3/3 passing).
