# Task: Bricks (Conveyor) Implementation & Config

This document describes the current Bricks adapter at `tasks/bricks/src/index.ts`.

## 1. Implementation Details

The Bricks task is implemented using the standardized `TaskAdapter` interface.

### `BricksTaskAdapter` (Class)

- **`initialize(context)`**: Sets up the task context.
- **`execute()`**: Runs the main Bricks task logic using core `runTaskSession` and managing DRT scopes via `TaskModuleRunner`.
- **`terminate()`**: Performs cleanup, including stopping all active task modules.

## 2. Runtime model

Bricks runs as a `native` task via the `LifecycleManager`.

## 2. Planning schema consumed by adapter

Top-level planning keys:
- `blocks[]` (required)
- `manipulations[]` (optional but typically present)

`blocks[*]`:
- `label`
- `trials`
- `manipulation` (single id)
- `manipulations` (ordered list of ids)
- `manipulationPool` (draws id bundle from top-level `manipulationPools`)
- `overrides`

`manipulations[*]`:
- `id`
- `label`
- `overrides`
- `trialPlan.schedule`
- `trialPlan.variants[]` (`id`, `label`, `weight`, `overrides`)

Per-trial config is deep-merged in this order:
1. full base config clone
2. selected manipulation overrides (for all resolved ids, in order)
3. block overrides
4. scheduled variant overrides

Top-level optional:
- `manipulationPools`:
  - `poolId: [ [manipA, manipB], [manipC], ... ]`
  - blocks with `manipulationPool: "poolId"` draw one bundle
  - draws are participant-seeded and shuffled without replacement, then recycled

## 3. Runtime config sections

The merged per-trial config is passed to conveyor runtime. Common sections:
- `display`
- `conveyors`
- `bricks`
- `drt`
- `trial`
- `experiment`
- `debug`
- `difficultyModel`
- `selfReport`
- `instructions`

For detailed runtime field definitions, use:
- [bricks-runtime-config-schema.md](./bricks-runtime-config-schema.md)

## 4. Event/data outputs

Per-trial conveyor output (`ConveyorTrialData`) is appended to `records`.

Final payload submitted/saved by `finalizeTaskRun`:

```json
{
  "selection": {},
  "records": [],
  "events": [],
  "drtScopes": []
}
```

Notes on `drt` outputs:
- Trial-scoped DRT: `record.drt` reflects that trial scope snapshot; transform rows are attached as `drt_transforms` and `drt_response_rows`.
- Block-scoped DRT: `record.drt.stats` is converted to per-trial deltas for accurate trial/block summaries, and cumulative snapshots are preserved in `record.drt_cumulative`.

Demo variant:
- `bricks/drt_block_demo` sets `drt.scope = "block"` for quick validation of continuous block-level DRT.

CSV export is task-specific and currently includes:
- `block_label`
- `block_index`
- `trial_index`
- `trial_duration_ms`
- `end_reason`
- `cleared`
- `dropped`
- `spawned`
- `drt_hits`
- `drt_misses`
