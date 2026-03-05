# Codebase Complexity and Redundancy Audit: Analysis & Recommendations

## 1. Executive Summary
The "Experiments" codebase currently exhibits a pattern of **Over-Abstraction in Core** coupled with **Monolithic Implementation in Tasks**. While the project aims for modularity, it has achieved "Functional Modularity" (small helper functions) but lacks "Behavioral Modularity" (unified task lifecycles). This forces every task to act as a "mini-application," leading to massive redundancy (e.g., N-Back's 72KB `index.ts`) and a high barrier to entry for new developers or task extensions.

## 2. The "Architecture Trap"
The user noted that refactoring often leads to "new architecture" rather than streamlining. This is because:
1.  **Core provides blocks, not skeletons:** `packages/core` is a toolbox of 50+ modules, but it doesn't provide a standard `BaseTask` or `ExperimentShell`.
2.  **Implementation Debt:** Because there is no standard runner, each task (Stroop, N-Back, SFT) defines its own interpretation of the experiment lifecycle.
3.  **Layering Overkill:** Features like DRT (Discrete Response Task) are spread across 5+ files (`drt.ts`, `drtController.ts`, `drtPresentationBridge.ts`, `drtScopeContract.ts`, `drtConfig.ts`). This forces tasks to import and coordinate multiple complex objects manually.

## 3. Key Findings: Redundant Paths & Unnecessary Complexity

### A. Fragmented Core vs. Monolithic Tasks
-   **Finding:** `packages/core` has 50+ small files, but tasks like N-Back and Stroop are monolithic `index.ts` files (38KB - 72KB).
-   **Complexity:** The "Surface Area" of `@experiments/core` is too large. Tasks must import 40-50 symbols just to bootstrap.
-   **Redundancy:** Every task re-implements:
    -   Config parsing and merging (`buildMergedConfig`).
    -   Variable resolution and stimulus pooling.
    -   JsPsych timeline construction and plugin setup.
    -   Finalization logic (`finalizeTaskRun`).

### B. The DRT Integration Problem
-   **Finding:** DRT integration is manual and repetitive. Tasks must manage `ModuleEmbedCoordinator`, `DrtController`, and `DrtScopeRecords` manually.
-   **Complexity:** In N-Back, the DRT setup alone takes ~100 lines of "glue code" that is essentially identical to what other tasks would need.
-   **Redundancy:** Logic for "Start DRT on Block Start" and "Stop DRT on Block End" is hardcoded into the task's trial loop.

### C. App-Level "Glue Code"
-   **Finding:** `apps/web/src/main.ts` is ~100 lines of manual configuration loading, auto-responder setup, and DOM manipulation.
-   **Complexity:** The application layer "knows" too much about the internal configuration structure (e.g., `import.meta.glob` for JSON configs).
-   **Redundancy:** If we add a new application (e.g., a mobile shell), we would have to copy all this bootstrap logic.

### D. Duplicate Behavioral Patterns
-   **Finding:** Stroop and N-Back both use a "Canvas Frame" for rendering, but they define their own `drawStimulus` and `layout` logic.
-   **Complexity:** The `computeCanvasFrameLayout` is used, but the actual `drawCanvasFramedScene` calls are manual and inconsistent.

## 4. Recommendations for Streamlining

### Step 1: Consolidate the Core (Unification)
-   **Merge DRT Modules:** Consolidate `drt.ts`, `drtController.ts`, `drtConfig.ts`, and `drtPresentationBridge.ts` into a single `drt.ts` (or a `drt/` directory with fewer, larger files).
-   **Unify Module Scopes:** The `ModuleEmbedCoordinator` is an over-engineered abstraction for what is essentially a lifecycle hook. Simplify this into a `TaskModule` interface that the `BaseTask` runner understands.

### Step 2: Introduce an `ExperimentShell` (App Level)
-   **Objective:** Move the bootstrap logic from `apps/web/src/main.ts` to `packages/core/src/shell.ts`.
-   **Impact:** The `main.ts` should be reduced to:
    ```typescript
    const shell = new ExperimentShell({ adapters: [nbackAdapter, stroopAdapter, ...] });
    await shell.bootstrap("#app");
    ```

### Step 3: Introduce a `StandardTask` Skeleton (Task Level)
-   **Objective:** Create a `StandardTask` or `JsPsychTask` base class in Core that handles:
    -   Standard Config Schema (Mapping, Timing, Display).
    -   Automatic Variable Resolution.
    -   Automatic Preloading of assets.
    -   Automatic DRT/RT-Task injection based on config.
-   **Impact:** N-Back's `index.ts` would shrink from 72KB to <10KB, focusing only on its unique `buildPlan` and `drawStimulus` logic.

### Step 4: Componentize Rendering
-   **Objective:** Create a `CanvasRenderer` class in Core that wraps the "Framed Scene" logic.
-   **Impact:** Instead of tasks manually calculating `DOMRect` for the canvas, they just tell the renderer: `renderer.draw(stimulus)`.

## 5. Conclusion
The current architecture favors **isolation over unification**. This has led to a codebase where every task is a custom-built machine rather than a configuration of a shared engine. By moving from "Functional Utility" to "Behavioral Framework," we can eliminate 60-70% of the redundant code in tasks and make the system significantly more robust and easier to extend.
