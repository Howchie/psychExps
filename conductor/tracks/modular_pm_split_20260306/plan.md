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

## Phase 2: Extract ProspectiveMemoryModule to Core [checkpoint: 088cb82]
- [x] Task: Create `ProspectiveMemoryModule` in Core 088cb82
    - [x] Write failing tests in `packages/core/src/engines/prospectiveMemory.test.ts` for a modular PM implementation. 088cb82
    - [x] Implement `ProspectiveMemoryModule` class implementing `TaskModule`. 088cb82
    - [x] Port `generateProspectiveMemoryPositions` and response evaluation to the module. 088cb82
    - [x] Implement `handleKey` in the module for PM response. 088cb82
    - [x] Verify tests pass. 088cb82
- [x] Task: Implement PM Stimulus Rendering in Core 088cb82
    - [x] Write tests for rendering PM items via the module. 088cb82
    - [x] Implement modular rendering hooks for PM items. 088cb82 (Integration with primary renderer)
    - [x] Verify tests pass. 088cb82
- [x] Task: Conductor - User Manual Verification 'Extract ProspectiveMemoryModule to Core' (Protocol in workflow.md) 088cb82

## Phase 3: Refactor NBack Task to use Modular PM [checkpoint: 088cb82]
- [x] Task: Remove hardcoded PM logic from NBack 088cb82
    - [x] Identify and remove PM-specific planning and execution code from `tasks/nback/src/index.ts`. 088cb82
    - [x] Run NBack tests and ensure they still pass for "pure" n-back variants. 088cb82
- [x] Task: Integrate `ProspectiveMemoryModule` into NBack 088cb82
    - [x] Update `NbackTaskAdapter` to initialize and use the `ProspectiveMemoryModule` via `TaskModuleRunner`. 088cb82
    - [x] Ensure `pm_module_demo` variant works with the new modular approach. 088cb82
    - [x] Verify all NBack + PM tests pass. 088cb82
- [x] Task: Conductor - User Manual Verification 'Refactor NBack Task to use Modular PM' (Protocol in workflow.md) 088cb82

## Phase 4: AnnikaHons Parity Port and Verification [checkpoint: 088cb82]
- [x] Task: Replicate `annikaHons` Variant in NBack 088cb82
    - [x] Create `configs/nback/annikaHons.json` as a copy/adaptation of the PM task variant. 088cb82
    - [x] Add the variant to `NbackTaskAdapter` manifest. 088cb82
- [x] Task: Verify Feature Parity 088cb82
    - [x] Write integration tests in `tasks/nback/src/index.test.ts` for the `annikaHons` variant. 088cb82
    - [x] Compare trial records and behavior with the original `pm` task version. 088cb82
    - [x] Verify all tests pass. 088cb82
- [x] Task: Conductor - User Manual Verification 'AnnikaHons Parity Port and Verification' (Protocol in workflow.md) 088cb82

## Phase: Review Fixes [checkpoint: 088cb82]
- [x] Task: Apply review suggestions 088cb82
    - [x] Fix block-level variable resolution for modular configs. 088cb82
    - [x] Fix response monitoring and trial termination for modular keys. 088cb82
    - [x] Enhance variable resolver with array flattening and namespace fallback. 088cb82
