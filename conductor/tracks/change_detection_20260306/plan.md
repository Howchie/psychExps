# Implementation Plan - Change Detection Paradigm

## Phase 1: Core Spatial and Scene Enhancements [checkpoint: ec429c9]
- [x] Task: Implement `SpatialLayoutManager` in `@experiments/core`
    - [x] Write unit tests for random and template-based non-overlapping slot generation
    - [x] Implement `SpatialLayoutManager` with support for circular and grid templates
- [x] Task: Implement `SceneStimulus` model and diffing logic
    - [x] Write unit tests for scene creation and identity diffing (same/different)
    - [x] Implement `SceneStimulus` types and `diffScenes` utility
- [x] Task: Conductor - User Manual Verification 'Phase 1: Core Spatial and Scene Enhancements' (Protocol in workflow.md)

## Phase 2: Core Trial Flow Enhancement [checkpoint: bbbe949]
- [x] Task: Generalize `rtTask` to support multi-phase structures
    - [x] Write unit tests for dynamic phase sequence execution and timing
    - [x] Refactor `runBasicRtTrial` or create `runMultiPhaseTrial` to support dynamic stage arrays
- [x] Task: Enhance `SceneRenderer` to support multi-slot displays
    - [x] Write tests for rendering Images and Shapes within structured slots
    - [x] Implement canvas rendering hooks for `SceneStimulus`
- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Trial Flow Enhancement' (Protocol in workflow.md)

## Phase 3: Change Detection Task Implementation [checkpoint: 3c7afe5]
- [x] Task: Scaffold `tasks/change_detection` package
    - [x] Create package structure and configuration schema
- [x] Task: Implement Change Detection trial planner
    - [x] Write unit tests for change/no-change proportions and set-size distribution
    - [x] Implement planner logic using core RNG and sampling helpers
- [x] Task: Implement task adapter logic and UI
    - [x] Implement `initialize`, `execute`, and `terminate` methods using core enhancements
    - [x] Create basic instructions and feedback screens
- [x] Task: Conductor - User Manual Verification 'Phase 3: Change Detection Task Implementation' (Protocol in workflow.md)

## Phase 4: Final Validation and Documentation [checkpoint: 186f079]
- [x] Task: Verify end-to-end functionality with auto-responder
    - [x] Run synthetic sessions to verify data contract and reproducibility
- [x] Task: Update project documentation
    - [x] Add `TASK_CHANGE_DETECTION.md` and update `CORE_API.md`
- [x] Task: Conductor - User Manual Verification 'Phase 4: Final Validation and Documentation' (Protocol in workflow.md)

## Phase: Review Fixes
- [x] Task: Apply review suggestions 8d41f88
