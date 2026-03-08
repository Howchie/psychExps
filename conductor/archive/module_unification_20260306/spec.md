# Specification: Standardize Modular Extensions (Track: module_unification_20260306)

## Overview
This track aims to eliminate redundant code pathways by unifying the initialization and configuration of all modular task extensions (e.g., DRT, PM). All tasks must use the standardized `task.modules` configuration path, and the core framework will be responsible for module registration and lifecycle management.

## Functional Requirements
1.  **Core Auto-Registration:**
    -   The `LifecycleManager` in `packages/core/src/api/taskAdapter.ts` will automatically register all available modules (e.g., `DrtModule`, `ProspectiveMemoryModule`) with the `TaskModuleRunner` for every task.
2.  **Configuration Unification:**
    -   All references to top-level `drt`, `pm`, or similar modular keys must be removed from individual task parsing logic.
    -   Configuration for modules will be exclusively read from `task.modules.<module_id>`.
    -   The configuration parser (or core validator) must throw a **Hard Error** if legacy top-level keys like `drt` or `pm` are found in the root task configuration, forcing an immediate upgrade of JSON files.
3.  **Task Refactoring (All Tasks):**
    -   **NBack:** Finalize the removal of any remaining redundant DRT logic and ensure it uses the core module hooks.
    -   **Bricks:** Refactor to remove its custom DRT initialization and utilize the core `TaskModuleRunner` configuration.
    -   **PM (Legacy):** Update to reflect the new modular PM approach, or deprecate/transition its configs to NBack.
    -   **Stroop, Tracking, SFT, Change Detection:** Ensure these tasks are compatible with the `TaskModuleRunner` and can accept modular injections (even if they don't use them by default).
4.  **Config Updates:**
    -   Migrate all JSON configuration files in the `configs/` directory to use the new `task.modules.drt` or `task.modules.pm` format.

## Success Criteria
-   All tasks can run DRT or PM modules solely by configuring `task.modules` in their JSON.
-   No task contains its own bespoke module initialization or teardown code.
-   Attempting to use a legacy `drt` or `pm` key at the root of a JSON config throws a clear, fatal error.
-   All automated tests pass across all packages.