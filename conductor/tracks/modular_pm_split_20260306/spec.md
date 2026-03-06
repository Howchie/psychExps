# Specification: Modular Prospective Memory Extraction (Track: modular_pm_split_20260306)

## Overview
This track aims to decouple the Prospective Memory (PM) functionality from the NBack task by extracting it into a reusable `ProspectiveMemoryModule` in the core package. Currently, the `nback` task contains hardcoded PM logic, and the `pm` task is a hardbound combination of NBack and PM. This modularization will enable any task to use the PM module while keeping the primary task code focused and "pure."

## Functional Requirements
1.  **Core ProspectiveMemoryModule:**
    -   Create a `ProspectiveMemoryModule` (implementing `TaskModule`) in `packages/core/src/engines/prospectiveMemory.ts`.
    -   This module should handle PM scheduling (`generateProspectiveMemoryPositions`), stimulus drawing/rendering, and response evaluation.
2.  **NBack Task Refactoring:**
    -   Remove all hardcoded PM logic from `tasks/nback/src/index.ts`.
    -   Ensure NBack can run as a standalone task without any PM-specific planning.
    -   Integrate the `ProspectiveMemoryModule` through the `TaskModuleRunner` in NBack.
3.  **Key Arbitration:**
    -   Enhance the `TaskModuleRunner` in `packages/core/src/api/taskModule.ts` to manage key ownership across multiple active modules and the primary task.
4.  **AnnikaHons Parity Port:**
    -   Replicate the `annikaHons` variant (from the `pm` task) in the `nback` task.
    -   Verify that the new `nback` variant achieves feature parity with the original `pm` version.
5.  **Integration Streamlining:**
    -   Ensure that adding the PM module to a task requires minimal configuration effort.

## Success Criteria
-   `nback` source code is completely free of PM-specific logic.
-   `nback` + `ProspectiveMemoryModule` is feature-equivalent to the current `pm` task.
-   Key conflicts are handled correctly via core arbitration.
-   Verified port of the `annikaHons` variant to the new architecture.

## Out of Scope
-   Modifying the original `tasks/pm/src/index.ts` code.
-   Deprecating the existing `pm` task at this stage.
