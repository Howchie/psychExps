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
  - `nback/pm_module_export_demo`

## Response mapping

`mapping.targetKey` is required.

`mapping.nonTargetKey` is optional:
- If set, non-target responses are key-based.
- If omitted/`"none"`/`"withhold"`, non-targets are scored as `timeout` (withheld response is correct).

## Instructions

`instructions` supports shared config-level screen slots:
- `pages` (preferred): string/object or array
  - aliases: `introPages`, `intro`, `screens`
- `preBlockPages` (string/object or array)
- `postBlockPages` (string/object or array)
- `endPages` (string/object or array)
- `blockIntroTemplate` (`{nLevel}`)
- `blockIntroControlTemplate` (`{nLevel}`)
- `blockIntroPmTemplate` (`{nLevel}`, `{pmCategoryText}`)
- `pmTemplate` (optional intro page text)
- `showBlockLabel` (default `true`)
- `preBlockBeforeBlockIntro` (default `false`)
- `insertions` (optional array): generalized instruction insertion points for additional pages
- `blockSummary` (optional object): computed block-end summary page using trial results

`rtTask` supports task-level defaults and block-level overrides:
- `task.rtTask` defines default RT timing/behavior.
- `plan.blocks[].rtTask` can override any subset (`enabled`, `responseTerminatesTrial`, `timing.*`) per block.

`repeatUntil` supports block-level retry loops:
- `plan.blocks[].repeatUntil` can repeat the same block until a threshold is met or `maxAttempts` is reached.
- Thresholds are computed from current-attempt trial results only (no retrospective rescoring history).
- `afterBlockScreens` are shown on the final attempt only.
- Use `repeatAfterBlockScreens` (alias: `repeatPostBlockScreens`) to show retry-specific pages on non-final attempts.

`preBlockPages`/`postBlockPages` are positional shortcuts applied to every block and are combined with each block's `beforeBlockScreens`/`afterBlockScreens`.
Setting a slot to `""` (or arrays containing only blank strings) clears that slot.

Instruction page object shape (for slots and insertions):
- `text`: plain text (escaped)
- `html`: raw HTML fragment
- `title`: optional per-page heading
- `actions`: optional button array (`continue`/`exit`) for that page
  - `exit` stops task execution immediately and skips completion finalization/redirect.

Supported insertion points:
- `task_intro_before`
- `task_intro_after`
- `block_start_before_intro`
- `block_start_after_intro`
- `block_start_after_pre`
- `block_end_before_post`
- `block_end_after_post`
- `task_end_before`
- `task_end_after`

`instructions.blockSummary` example for NBack:
```json
{
  "instructions": {
    "blockSummary": {
      "enabled": true,
      "at": "before_post",
      "title": "End of {blockLabel}",
      "lines": ["Accuracy: {accuracyPct}% ({correct}/{total})", "Mean RT: {meanRtMs} ms"],
      "metrics": {
        "correctField": "responseCorrect",
        "rtField": "responseRtMs"
      },
      "where": {
        "trialType": ["N"]
      },
      "when": {
        "isPractice": true
      }
    }
  }
}
```

You can also override `blockSummary` per block/manipulation via `plan.blocks[].blockSummary` in NBack.

`plan.blocks[].repeatUntil` example:
```json
{
  "plan": {
    "blocks": [
      {
        "label": "Practice",
        "isPractice": true,
        "trials": 20,
        "repeatUntil": {
          "enabled": true,
          "maxAttempts": 3,
          "minAccuracy": 0.8,
          "where": { "trialType": ["N"] },
          "metrics": { "correctField": "responseCorrect" }
        },
        "repeatAfterBlockScreens": [
          "We will repeat this block.",
          "Remember: press / only for exact N-back matches."
        ]
      }
    ]
  }
}
```

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

`task.modules.drt` config:
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
- Block-level RT overrides are supported in `plan.blocks[].rtTask` so practice and main blocks can run different response timings.
- Block-level overrides are supported in `plan.blocks[].modules.drt` so different blocks can use different DRT modes/settings.

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
- `task.modules.pm` rule-based PM injection
- PM slot scheduling (`schedule.count`, `schedule.minSeparation`, `schedule.maxSeparation`)
- PM category targeting via module rules (`rules[].categories`)
- Block-local PM enable/count/category overrides via `plan.blocks[].variables` + tokenized module config
- PM key activation driven by injected PM trials in each block

## Injector Module (Generic Trial Injection)

NBack also supports a generic core injector module at `task.modules.injector`.
This enables arbitrary trial injection into the ongoing block plan (including PM-like and control-like injections) without task-specific planner code.

High-level shape:
```json
{
  "task": {
    "modules": {
      "injector": {
        "enabled": true,
        "injections": [
          {
            "id": "pm_animals",
            "schedule": { "count": 5, "minSeparation": 8, "maxSeparation": 11 },
            "eligibleTrialTypes": ["F"],
            "source": { "type": "category_in", "categories": ["animals"] },
            "sourceDraw": {
              "mode": "without_replacement",
              "scope": "block",
              "shuffle": true
            },
            "set": {
              "trialType": "PM",
              "itemCategory": "PM",
              "correctResponse": "space",
              "responseCategory": "pm"
            }
          }
        ]
      }
    }
  }
}
```

Notes:
- `source.type` supports:
  - `category_in` (draw from configured stimulus categories)
  - `literal` (draw from an inline item list)
- `sourceDraw` controls item reuse behavior for injected items:
  - `mode`: `without_replacement` (default), `with_replacement`, `ordered`
  - `scope`: `block` (default) or `participant`
  - `shuffle`: default `true`
- `without_replacement` automatically recycles when the pool is exhausted (shuffle/consume/recycle), so large PM counts do not crash.
- `set.correctResponse` controls expected response for injected trials.
- `set.responseCategory` is optional and contributes semantic category mapping.
- If an injected response key is not present in base mapping, NBack automatically adds it to allowed keys for blocks containing those trials.

## Canonical PM Integration Path

NBack + core PM module is the canonical PM-integration direction.

Current PM module path in NBack:
- uses core module lifecycle (`TaskModuleRunner` scoped start/stop)
- applies PM trial transformations through `task.modules.pm`
- exports module scope outputs in finalized payload (`payload.moduleResults`)

Parity with standalone PM task is still partial. See:
- `docs/PM_NBACK_PARITY_AUDIT.md`

## Stimulus Export (No Full Run)

For parity workflows, NBack can export planned stimulus lists without executing trials.

Launch with:
- `?task=nback&variant=<variant>&exportStimuli=true`

Behavior:
- Skips timeline execution.
- Saves a CSV with planned rows including:
  - `block_phase` and condition-level `block_type`
  - `trial_type`
  - item/source-category and block/trial indices.
