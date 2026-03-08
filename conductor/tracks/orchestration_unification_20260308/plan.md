# Implementation Plan: Task Orchestration Unification (Track: orchestration_unification_20260308)

## Phase 1: Core Orchestrator Design & Implementation
- [ ] Task: Design and implement `TaskOrchestrator` in `packages/core`
    - [ ] Define `TaskOrchestrator` interface and options.
    - [ ] Implement the automated block/trial loop with integrated module hooks.
    - [ ] Add unit tests for the orchestrator flow.
- [ ] Task: Conductor - User Manual Verification 'Core Orchestrator Design & Implementation' (Protocol in workflow.md)

## Phase 2: NBack Refactor
- [ ] Task: Refactor `nback` to use `TaskOrchestrator`
    - [ ] Remove manual timeline building and module start/stop hooks.
    - [ ] Migrate `nback` trial execution to the orchestrator's trial hook.
    - [ ] Verify `nback` functionality and parity.
- [ ] Task: Conductor - User Manual Verification 'NBack Refactor' (Protocol in workflow.md)

## Phase 3: Bricks Refactor
- [ ] Task: Refactor `bricks` to use `TaskOrchestrator`
    - [ ] Remove manual DRT scope management.
    - [ ] Standardize `bricks` block/trial transitions via core.
    - [ ] Verify `bricks` functionality and parity.
- [ ] Task: Conductor - User Manual Verification 'Bricks Refactor' (Protocol in workflow.md)

## Phase 4: Final Unification & Cleanup
- [ ] Task: Standardize data finalization in `TaskOrchestrator`
    - [ ] Move `finalizeTaskRun` logic into the orchestrator's completion phase.
    - [ ] Ensure all modular data is automatically captured in the final payload.
- [ ] Task: Conductor - User Manual Verification 'Final Unification & Cleanup' (Protocol in workflow.md)
