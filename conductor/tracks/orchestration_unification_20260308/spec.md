# Specification: Task Orchestration Unification (Track: orchestration_unification_20260308)

## Overview
Currently, each task adapter manually manages its high-level lifecycle, including instruction screens, block/trial looping, module (DRT/PM) start/stop hooks, and data finalization. This leads to significant code redundancy and inconsistency. This track introduces a core `TaskOrchestrator` to automate these flows, allowing adapters to focus purely on their specific trial logic.

## Functional Requirements
1.  **Core TaskOrchestrator:**
    -   Implement a centralized orchestrator in `packages/core` that handles the high-level `runTaskSession` flow.
    -   Automate the injection of `startScopedModules` and `stopScopedModules` based on task/block/trial configurations.
    -   Standardize the transition between instruction screens, block intros, and trial execution.
2.  **Declarative Module Mapping:**
    -   Formalize the mapping between task configurations and module activations so that adapters don't need to manually instantiate or stop modules.
3.  **Unified Data Pipeline:**
    -   Ensure `TaskOrchestrator` automatically collects and merges host trial data with modular data (e.g., DRT hits, PM responses) into a standardized final result.
4.  **Boilerplate Reduction:**
    -   Refactor at least two major tasks (`nback` and `bricks`) to use the new orchestrator, aiming for a significant reduction in task-level code.

## Success Criteria
-   `nback` and `bricks` task adapters contain zero manual `moduleRunner.start/stop` calls.
-   Instruction flows and block transitions are consistent across refactored tasks.
-   Data finalization is handled automatically by the core framework.
-   Task-level `index.ts` files are reduced in complexity and size.
