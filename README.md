# Experiments Workspace

Unified experiment framework with a shared TypeScript core and task adapters.

## Documentation

- [Docs index](./docs/README.md)
- [Core framework API](./docs/CORE_API.md)
- [Configuration & inheritance](./docs/CONFIGURATION_GUIDE.md)
- [Task: SFT](./docs/TASK_SFT.md)
- [Task: PM](./docs/TASK_PM.md)
- [Task: NBack](./docs/TASK_NBACK.md)
- [Task: Bricks](./docs/TASK_BRICKS.md)
- [Task: Stroop](./docs/TASK_STROOP.md)
- [Task: Tracking](./docs/TASK_TRACKING.md)
- [Bricks runtime config schema](./docs/bricks-runtime-config-schema.md)

## Structure

- `packages/core`: shared runtime, selection, config, scheduler, integration utilities
- `apps/web`: selection-aware browser shell
- `tasks/sft`: SFT (DotsExp) task adapter
- `tasks/pm`: PM task adapter
- `tasks/bricks`: Bricks (DiscoveryProject) task adapter
- `tasks/stroop`: Stroop task adapter
- `tasks/tracking`: continuous tracking task adapter
- `configs/*`: core + task-specific presets

## URL selection

Supported query params:

- `task`: task id (`sft`, `pm`, `nback`, `bricks`, `stroop`, `tracking`)
- `variant`: variant id within task
- `config`: optional task config path override
- `overrides`: URL-encoded JSON override

Participant params:

- `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`, `SONA_ID`, `participant`, `survey_code`

## Dev

```bash
npm install
npm run dev
```

Auto-responder launch example:

```text
http://localhost:5173/?task=sft&variant=default&auto=true
```

## Design stance

The common framework is the source of truth. Task adapters run natively inside this workspace and do not redirect into external experiment folders.
