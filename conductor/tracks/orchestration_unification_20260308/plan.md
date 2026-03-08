# Implementation Plan: Task Orchestration Unification (Track: orchestration_unification_20260308)

## Phase 1: Core Orchestrator Design & Implementation [checkpoint: 9edfd47]
- [x] Task: Design and implement `TaskOrchestrator` in `packages/core` 9edfd47
    - [x] Define `TaskOrchestrator` interface and options. 9edfd47
    - [x] Implement the automated block/trial loop with integrated module hooks. 9edfd47
    - [x] Add unit tests for the orchestrator flow. 9edfd47
- [x] Task: Conductor - User Manual Verification 'Core Orchestrator Design & Implementation' (Protocol in workflow.md) 9edfd47

## Phase 2: NBack Refactor [checkpoint: d3e652d]
- [x] Task: Refactor `nback` to use `TaskOrchestrator` d3e652d
    - [x] Remove manual timeline building and module start/stop hooks. d3e652d
    - [x] Migrate `nback` trial execution to the orchestrator's trial hook. d3e652d
    - [x] Verify `nback` functionality and parity. d3e652d
- [x] Task: Conductor - User Manual Verification 'NBack Refactor' (Protocol in workflow.md) d3e652d

## Phase 3: Bricks Refactor [checkpoint: 11102a7]
- [x] Task: Refactor `bricks` to use `TaskOrchestrator` 11102a7
    - [x] Remove manual DRT scope management. 11102a7
    - [x] Standardize `bricks` block/trial transitions via core. 11102a7
    - [x] Verify `bricks` functionality and parity. 11102a7
- [x] Task: Conductor - User Manual Verification 'Bricks Refactor' (Protocol in workflow.md) 11102a7

## Phase 4: Final Unification & Cleanup [checkpoint: 96d71b6]
- [x] Task: Standardize data finalization in `TaskOrchestrator` 96d71b6
    - [x] Move `finalizeTaskRun` logic into the orchestrator's completion phase. 96d71b6
    - [x] Ensure all modular data is automatically captured in the final payload. 96d71b6
- [x] Task: Conductor - User Manual Verification 'Final Unification & Cleanup' (Protocol in workflow.md) 96d71b6
