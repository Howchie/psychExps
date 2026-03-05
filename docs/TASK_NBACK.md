# Task: NBack

This document reflects the current `tasks/nback` implementation.

## 1. Implementation Details

The NBack task is implemented using the standardized `TaskAdapter` interface.

### `NbackTaskAdapter` (Class)

- **`initialize(context)`**: Prepares the task runtime by parsing configuration and generating the block plan.
- **`execute()`**: Runs the jsPsych timeline, handles trial execution, and manages DRT scopes using `TaskModuleRunner`.
- **`terminate()`**: Performs cleanup, including resetting the cursor, stopping all task modules, and removing keyboard scroll blockers.

## 2. Runner and structure

- Runner: `jspsych` via `LifecycleManager`
- Adapter: `tasks/nback/src/index.ts`
- Variants:
  - `nback/default`
  - `nback/drt_block_demo`
  - `nback/pm_module_demo`

## Response mapping

`mapping.targetKey` is required.

`mapping.nonTargetKey` is optional:
- If set, non-target responses are key-based.
- If omitted/`"none"`/`"withhold"`, non-targets are scored as `timeout` (withheld response is correct).

## Instructions

`instructions` supports shared config-level screen slots:
- `pages` (preferred): string or string[]
  - aliases: `introPages`, `intro`, `screens`
- `preBlockPages` (string or string[])
- `postBlockPages` (string or string[])
- `endPages` (string or string[])
- `blockIntroTemplate` (`{nLevel}`)
- `blockIntroControlTemplate` (`{nLevel}`)
- `blockIntroPmTemplate` (`{nLevel}`, `{pmCategoryText}`)
- `pmTemplate` (optional intro page text)
- `showBlockLabel` (default `true`)
- `preBlockBeforeBlockIntro` (default `false`)

`preBlockPages`/`postBlockPages` are positional shortcuts applied to every block and are combined with each block's `beforeBlockScreens`/`afterBlockScreens`.
Setting a slot to `""` (or arrays containing only blank strings) clears that slot.

Example:
```json
{
  "instructions": {
    "pages": [
      "Welcome.",
      "Press / for targets.",
      "Withhold response for non-targets."
    ],
    "preBlockPages": "Next block starts now.",
    "endPages": "All blocks complete."
  }
}
```

## DRT integration

NBack supports optional DRT using shared core controller (`DrtController`):

`task.drt` config:
- `enabled`: boolean
- `scope`: `"block"` or `"trial"`
- `key`: DRT response key (for example `"space"`)
- `responseWindowMs`: probe response window
- `displayDurationMs`: probe presentation duration (independent of response window)
- `responseTerminatesStimulus`: whether a valid DRT response hides the probe immediately
- `transformPersistence`: `"scope"` (default) or `"session"`; controls whether online transform windows reset at each DRT scope boundary
- `isiSampler`: core sampler spec (`uniform`, `normal`, etc.)
- `stimMode`: `"visual" | "auditory" | "border"` (+ combined aliases)
- `visual`, `audio`, `border`: mode-specific presentation settings
- `parameterTransforms`: optional online parameter model list (core-level), currently includes:
  - `type: "wald_conjugate"` for moving-window shifted-Wald drift/threshold estimates from DRT RTs

Behavior:
- `scope: "block"` runs DRT continuously across all trials in a block, excluding inter-block screens.
- `scope: "trial"` starts/stops DRT per trial.
- DRT events are emitted into the task event stream and included in final payload extras (`payload.drt.scopeRecords`).
- Transform updates are emitted as `drt_transform_estimate` events and each scope record includes transform runtime export (`scopeRecords[].transforms`).
- DRT scope records also include row-aligned transform linkage for each DRT response (`scopeRecords[].responseRows`).
- Visual default is a red square shown at top-center of the monitor viewport (`position: fixed`), not constrained to the task canvas.
- Border mode applies a flashing outline to the inner framed stimulus area (the square where n-back items are drawn), not the full task host/container.
- Block-level `drt` overrides are supported in `plan.blocks[]` so different blocks can use different DRT modes/settings.

## Demo variant

`configs/nback/drt_block_demo.json` demonstrates:
- Block-scoped DRT on `space`.
- NBack target on `/`.
- Withheld non-target response.
- Source pool of numerals `1-9` repeated three times (27 items) with shuffled without-replacement draw prior to target insertion.
- Two blocks in one config:
  - Block 1: visual top-center square probe
  - Block 2: border-flash probe
- ISO-like timing profile:
  - `displayDurationMs: 1000`
  - `responseWindowMs: 2500`
  - `responseTerminatesStimulus: true`
  - uniform ISI `3000-5000 ms`
- Demo also includes a `wald_conjugate` online transform with `10-50` trial moving window and prior-mean shifting.

## PM Module Demo

`configs/nback/pm_module_demo.json` demonstrates additive PM-module behavior inside NBack:
- `mapping.pmKey` (SPACE)
- PM/control block typing via `blockType`
- PM slot scheduling (`pmCount`, `minPmSeparation`, `maxPmSeparation`)
- PM category targeting (`activePmCategories`)
- Control blocks without PM response slots
- PM-aware block intro templates and key policy
