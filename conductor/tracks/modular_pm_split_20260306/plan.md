# Implementation Plan: Modular Prospective Memory Extraction (Track: modular_pm_split_20260306)

## Phase 1: Core Key Arbitration and TaskModule Enhancement [checkpoint: 60d97c8]
- [x] Task: Implement Key Arbitration in `TaskModuleRunner` 60d97c8
    - [x] Write failing tests in `packages/core/src/api/taskModule.test.ts` for multiple modules handling the same key. 60d97c8
    - [x] Update `TaskModuleRunner.handleKey` to support a priority-based or registration-based arbitration. 60d97c8
    - [x] Verify tests pass. 60d97c8
- [x] Task: Add `onKeyHandled` event to `TaskModuleRunner` 60d97c8
    - [x] Write tests to ensure an event is emitted when a module handles a key. 60d97c8
    - [x] Implement the event emission. 60d97c8
    - [x] Verify tests pass. 60d97c8
- [x] Task: Conductor - User Manual Verification 'Core Key Arbitration and TaskModule Enhancement' (Protocol in workflow.md) 60d97c8

## Phase 2: Extract ProspectiveMemoryModule to Core
- [ ] Task: Create `ProspectiveMemoryModule` in Core
    - [ ] Write failing tests in `packages/core/src/engines/prospectiveMemory.test.ts` for a modular PM implementation.
    - [ ] Implement `ProspectiveMemoryModule` class implementing `TaskModule`.
    - [ ] Port `generateProspectiveMemoryPositions` and response evaluation to the module.
    - [ ] Implement `handleKey` in the module for PM response.
    - [ ] Verify tests pass.
- [ ] Task: Implement PM Stimulus Rendering in Core
    - [ ] Write tests for rendering PM items via the module.
    - [ ] Implement modular rendering hooks for PM items.
    - [ ] Verify tests pass.
- [ ] Task: Conductor - User Manual Verification 'Extract ProspectiveMemoryModule to Core' (Protocol in workflow.md)

## Phase 3: Refactor NBack Task to use Modular PM
- [ ] Task: Remove hardcoded PM logic from NBack
    - [ ] Identify and remove PM-specific planning and execution code from `tasks/nback/src/index.ts`.
    - [ ] Run NBack tests and ensure they still pass for "pure" n-back variants.
- [ ] Task: Integrate `ProspectiveMemoryModule` into NBack
    - [ ] Update `NbackTaskAdapter` to initialize and use the `ProspectiveMemoryModule` via `TaskModuleRunner`.
    - [ ] Ensure `pm_module_demo` variant works with the new modular approach.
    - [ ] Verify all NBack + PM tests pass.
- [ ] Task: Conductor - User Manual Verification 'Refactor NBack Task to use Modular PM' (Protocol in workflow.md)

## Phase 4: AnnikaHons Parity Port and Verification
- [ ] Task: Replicate `annikaHons` Variant in NBack
    - [ ] Create `configs/nback/annikaHons.json` as a copy/adaptation of the PM task variant.
    - [ ] Add the variant to `NbackTaskAdapter` manifest.
- [ ] Task: Verify Feature Parity
    - [ ] Write integration tests in `tasks/nback/src/index.test.ts` for the `annikaHons` variant.
    - [ ] Compare trial records and behavior with the original `pm` task version.
    - [ ] Verify all tests pass.
- [ ] Task: Conductor - User Manual Verification 'AnnikaHons Parity Port and Verification' (Protocol in workflow.md)
