# Experiments Framework Documentation

This documentation is implementation-first and tracks current behavior in this repository.

## Core References

- [**Core Framework API**](./CORE_API.md): Exhaustive reference for `@experiments/core` utilities.
- [**Configuration & Inheritance**](./CONFIGURATION_GUIDE.md): Deep dive into the merge system and runtime overrides.
- [**Task: SFT (DotsExp)**](./TASK_SFT.md): Implementation and config details for the SFT task.
- [**Task: PM (N-Back)**](./TASK_PM.md): Implementation and config details for the Prospective Memory task.
- [**Task: NBack**](./TASK_NBACK.md): Implementation and config details for the standalone NBack task.
- [**Task: Bricks (Conveyor)**](./TASK_BRICKS.md): Implementation and config details for the Bricks/Conveyor task.
- [**Task: Stroop**](./TASK_STROOP.md): Implementation and config details for the Stroop task.
- [**Task: Tracking**](./TASK_TRACKING.md): Implementation and config details for the continuous tracking task.
- [**Task: Change Detection**](./TASK_CHANGE_DETECTION.md): Implementation and config details for the Change Detection task.
- [**Bricks runtime config schema**](./bricks-runtime-config-schema.md): Runtime-facing schema for conveyor internals.

## Most common recipes

- Run local dev shell: `npm run dev`
- Run SFT default: `http://localhost:5173/?task=sft&variant=default`
- Run PM modern: `http://localhost:5173/?task=pm&variant=modern`
- Run Bricks spotlight: `http://localhost:5173/?task=bricks&variant=spotlight`
- Run Stroop default: `http://localhost:5173/?task=stroop&variant=default`
- Run Tracking default: `http://localhost:5173/?task=tracking&variant=default`
- Run Change Detection default: `http://localhost:5173/?task=change_detection&variant=default`
- Run any task with auto-responder: append `&auto=true`
- Run with explicit config path: `http://localhost:5173/?task=sft&variant=default&config=sft/staircase_example`
- Run with JSON override: `?task=pm&variant=modern&overrides=%7B%22mapping%22%3A%7B%22targetKey%22%3A%22x%22%7D%7D`
