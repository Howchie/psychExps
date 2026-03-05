# Architecture Streamlining Plan

## 1. Executive Summary
This plan addresses the "Architecture Trap" where refactoring efforts lead to new layers of complexity rather than streamlining. The goal is to move from **Functional Modularity** (helper functions) to **Behavioral Modularity** (standardized lifecycles and engines).

## 2. Progress Overview

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Core Consolidation & Module Unification | **COMPLETED** |
| **Phase 2** | Application Shell (ExperimentShell) | PENDING |
| **Phase 3** | Standardized Task Skeleton (StandardTask) | PENDING |
| **Phase 4** | Unified Rendering Component | PENDING |

---

## 3. Detailed Phases

### Phase 1: Core Consolidation (COMPLETED)
**Objective:** Reduce the surface area of `@experiments/core` and simplify the modular extension system.

- [x] **Merge DRT Modules:** Consolidated `drt.ts`, `drtController.ts`, `drtConfig.ts`, and `drtPresentationBridge.ts` into a single, cohesive `packages/core/src/drt.ts`.
- [x] **Simplify Module System:** Replaced the over-engineered `ModuleEmbedCoordinator` and `moduleScopes.ts` with a streamlined `TaskModule` and `TaskModuleRunner` in `packages/core/src/taskModule.ts`.
- [x] **Interface Alignment:** Implemented `TaskModule` in DRT to allow automated injection by runners.
- [x] **Export Cleanup:** Updated `packages/core/src/index.ts` to remove redundant symbols and reflect the new unified structure.

### Phase 2: Application Shell (ExperimentShell)
**Objective:** Eliminate the manual "glue code" in `apps/web/src/main.ts` and make the application layer task-agnostic.

- [ ] **Create `ExperimentShell`:** Move bootstrap logic (config loading, auto-responder setup, fullscreen handling) to `packages/core/src/shell.ts`.
- [ ] **Unified Config Resolver:** Standardize how JSON configs are loaded and merged across different environments.
- [ ] **Refactor `main.ts`:** Reduce the web app entry point to a simple shell initialization.

### Phase 3: Standardized Task Skeleton (StandardTask)
**Objective:** Transform tasks from "mini-applications" into "behavioral configurations."

- [ ] **Create `BaseTask` / `StandardTask`:** Implement a base class in Core that handles the jsPsych/Native lifecycle automatically.
- [ ] **Automate Common Concerns:**
    - Standard Config Parsing (Mapping, Timing, Display).
    - Variable Resolution.
    - Asset Preloading.
    - Automatic DRT/RT-Task injection based on config.
- [ ] **Demonstration:** Refactor `tasks/stroop` to use the new skeleton, reducing its `index.ts` by ~70%.

### Phase 4: Unified Rendering
**Objective:** Centralize the "Framed Canvas" rendering pattern used across multiple tasks.

- [ ] **Create `CanvasRenderer`:** Encapsulate canvas layout, font scaling, and "framed scene" logic in a reusable Core component.
- [ ] **Update Tasks:** Migration of Stroop, N-Back, and Bricks to the unified renderer to ensure visual consistency and reduce canvas boilerplate.

---

## 4. Next Steps
1. Initialize `conductor` to formalize this plan.
2. Proceed with **Phase 2: Application Shell** implementation.
