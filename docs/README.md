# Experiments Framework Documentation

This documentation is implementation-first and tracks current behavior in this repository.

## Getting Started

- [**User Guide**](./USER_GUIDE.md): Installation, running locally, creating configs, deploying to JATOS, adding a new task.

## Core References

- [**Core Framework API**](./CORE_API.md): Exhaustive reference for `@experiments/core` utilities.
- [**Configuration & Inheritance**](./CONFIGURATION_GUIDE.md): Deep dive into the merge system, runtime overrides, variable resolution, and instruction slots.
- [**EEG Workflow**](./EEG_WORKFLOW.md): Local EEG bridge, optional LSL, and optional LabRecorder remote control.

## Task Adapters

- [**Task: NBack**](./TASK_NBACK.md): N-Back with optional PM/DRT/Injector modules.
- [**Task: SFT (DotsExp)**](./TASK_SFT.md): Signal-to-Fade task with staircase and flexible trial-plan composition.
- [**Task: Bricks (Conveyor)**](./TASK_BRICKS.md): Conveyor belt task with dynamic difficulty, spotlight, and DRT.
- [**Task: Stroop**](./TASK_STROOP.md): Colour-word Stroop (congruence and valence modes).
- [**Task: Tracking**](./TASK_TRACKING.md): Continuous mouse-tracking (pursuit) and multiple-object tracking (MOT).
- [**Task: Change Detection**](./TASK_CHANGE_DETECTION.md): Visual change detection with configurable set sizes and layouts.
- [**Task: Flanker**](./TASK_FLANKER.md): Eriksen Flanker task.
- [**Task: Go/No-Go**](./TASK_GO_NO_GO.md): Classic Go/No-Go cognitive control task.
- [**Task: RDK**](./TASK_RDK.md): Random Dot Kinematogram (direction and color judgment).
- [**Task: MATB**](./TASK_MATB.md): Multi-Attribute Task Battery — four simultaneous subtasks.

## Shared Modules

These components can be integrated into any compatible task adapter via `task.modules`:

- [**Module: Prospective Memory (PM)**](./MODULE_PM.md): Rule-based PM trial injection.
- [**Module: Detection Response Task (DRT)**](./MODULE_DRT.md): Concurrent detection task (ISO-standard).
- [**Module: Stimulus Injector**](./MODULE_INJECTOR.md): Generic trial injection and block-plan modification.

## Reference

- [**Bricks Runtime Config Schema**](./bricks-runtime-config-schema.md): Detailed runtime-facing schema for Bricks conveyor internals.

## Most Common Recipes

`?config=<taskId>/<file>` loads a config directly without needing it registered in the task manifest — prefer this for development. `?variant=<id>` is a shortcut for configs already listed in the task's `variants[]` manifest.

```
# Start dev server
npm run dev

# Run tasks using config path (works for any bundled config, no registration needed)
http://localhost:5173/?task=nback&config=nback/default
http://localhost:5173/?task=nback&config=nback/pm_module_demo
http://localhost:5173/?task=bricks&config=bricks/spotlight
http://localhost:5173/?task=stroop&config=stroop/default
http://localhost:5173/?task=matb&config=matb/default
http://localhost:5173/?task=rdk&config=rdk/default

# Add auto-responder (no keyboard input needed — good for smoke-testing)
http://localhost:5173/?task=stroop&config=stroop/default&auto=true

# Override individual config keys at runtime (URL-encoded JSON)
http://localhost:5173/?task=nback&config=nback/default&overrides=%7B%22mapping%22%3A%7B%22targetKey%22%3A%22k%22%7D%7D

# Export planned stimulus list without running
http://localhost:5173/?task=nback&config=nback/default&exportStimuli=true
```
