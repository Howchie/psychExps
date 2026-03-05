# Specification - Architectural Streamlining and Complexity Reduction

## Overview
This track aims to overhaul the current project architecture to reduce complexity and streamline core services and task adapters. Based on the initial plan, we will focus on consolidating redundant logic between the core and task adapters, simplifying the web shell's loading mechanism, and refactoring high-complexity modules (e.g., the scheduler or config handling). 

## Goals
- **Core-Task Consolidation:** Identify and migrate redundant functionality from task adapters into `@experiments/core`.
- **Web Shell Streamlining:** Simplify the `apps/web` task loading and configuration handling to reduce "magic" and improve transparency.
- **Complex Module Refactor:** Target and refactor high-complexity core modules to improve maintainability and follow better design patterns.
- **Dependency Flatting:** Reduce the depth and circularity of module dependencies across the monorepo.
- **Lifecycle Standardization:** Define and enforce a standardized lifecycle for all task adapters to ensure consistency and easier debugging.

## Requirements
### Functional
- The existing `pm` task MUST continue to function correctly until the new architectural systems are fully implemented and verified.
- All other tasks (e.g., `sft`, `nback`, `stroop`) can follow a "clean break" strategy, where they are updated or migrated to the new architecture as needed.
- The new architecture must support the existing feature set of the unified experiment framework.

### Non-Functional
- Significant reduction in architectural complexity as measured by dependency flattening and lifecycle standardization.
- Improved code readability and maintainability through the elimination of redundant logic.
- Adherence to the project's code style guidelines.

## Acceptance Criteria
- [ ] `@experiments/core` contains consolidated logic previously duplicated in task adapters.
- [ ] `apps/web` task loading and config handling is simplified and more explicit.
- [ ] Target complex core modules are refactored to be simpler and better structured.
- [ ] Task adapter lifecycle is clearly defined and implemented in the core framework.
- [ ] The `pm` task remains fully functional throughout the implementation.
- [ ] All updated and refactored code passes existing and new tests.

## Out of Scope
- Complete rewrite of all individual task adapter logic (only the interface/lifecycle integration is in scope).
- Introduction of new experimental tasks during this track.
- Changes to external dependencies unless strictly necessary for complexity reduction.
