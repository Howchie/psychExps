# Task: PM (N-Back) Implementation & Config

This document describes the current PM implementation integrated into `tasks/nback/src/index.ts`.

Status note (2026-03-14):
- Standalone PM (`nback_pm_old`) has been fully removed.
- All PM experiments now run through the modular `nback` task.
- Legacy `pm` URLs are handled by the unified NBack adapter.

## 1. Implementation Details

The PM task is implemented using the standardized `TaskAdapter` interface.

### `PmTaskAdapter` (Class)

- **`initialize(context)`**: Prepares the task runtime by parsing configuration and generating the block plan.
- **`execute()`**: Launches the jsPsych timeline, handles trial execution, and emits events.
- **`terminate()`**: Performs cleanup, including resetting the cursor and removing keyboard scroll blockers.

## 2. Runners and selection

PM supports the `jspsych` runner via the `LifecycleManager`. Selection is controlled by core `resolveSelection` and the unified web shell.
Current task id is `nback_pm_old` (legacy `pm` URLs are aliased by the web shell).

## 2.1 Stimulus Export (No Full Run)

For parity workflows, the legacy PM task can export planned stimulus lists without executing trials.

Launch with:
- `?task=nback&variant=<variant>&exportStimuli=true`

Behavior:
- Skips timeline execution.
- Saves a CSV with planned rows including:
  - `trial_type`
  - `trial_code` (`pm`, `lure_<n>`, `target`, `non_target`)
  - item/category and block/trial indices.

## 2. Config schema currently parsed

Top-level sections consumed by parser:
- `task`
- `mapping`
- `timing`
- `display`
- `feedback`
- `plan`
- `stimuli`
- `stimuliCsv`
- `imageAssets`
- `variables`
- `nbackRule`
- `instructions`
- `completion.redirect.completeUrlTemplate`

Top-level shared shell section (consumed by web shell, not PM parser):
- `ui.pageBackground` (controls area outside stimulus frame)

### 2.0 `task.rtTask`

Optional task-level RT phase config shared with core `rtTask` helpers:
- `task.rtTask.enabled` (default `false`)
- `task.rtTask.timing.trialDurationMs`
- `task.rtTask.timing.fixationDurationMs`
- `task.rtTask.timing.stimulusOnsetMs`
- `task.rtTask.timing.responseWindowStartMs`
- `task.rtTask.timing.responseWindowEndMs`
- `task.rtTask.responseTerminatesTrial` (default `false`)

PM should typically keep `responseTerminatesTrial: false` to preserve fixed trial duration while still recording first-response RT.

### 2.1 `mapping`

Required behavior:
- `targetKey`
- `nonTargetKey`
- `pmKey`

All are normalized via `normalizeKey` and must be distinct.

### 2.2 `timing`

- `trialDurationMs` (default `5000`)
- `fixationDurationMs` (default `500`)
- `stimulusOnsetMs` (default `1000`)
- `responseWindowStartMs` (default `1000`)
- `responseWindowEndMs` (default `5000`)

### 2.3 `display`

- `aperturePx` (default `440`)
- `paddingYPx` (default `16`)
- `cueHeightPx` (default `0`)
- `cueMarginBottomPx` (default `0`)
- `frameBackground` (default `#ffffff`)
- `frameBorder` (default `2px solid #d1d5db`)
- `textColor` (default `#111827`)
- `fixationFontSizePx` (default `28`)
- `fixationFontWeight` (default `500`)
- `stimulusFontSizePx` (default `48`)
- `stimulusScale` (default `0.82`, clamped `0.1..1`)
- `imageWidthPx` (optional; when set, target image draw width in px)
- `imageHeightPx` (optional; when set, target image draw height in px)
- `imageUpscale` (default `false`; if `false`, images will not be scaled above target/native size)

### 2.4 `plan`

Parsed from:
- `plan.blocks[]` (required)

Each block supports:
- `label`
- `phase` (`practice` or `main`, optional)
- `isPractice` (optional boolean override)
- `manipulation` (optional single manipulation id)
- `manipulations` (optional array of manipulation ids, applied in order)
- `manipulationPool` (optional pool id; draws one manipulation bundle from `plan.manipulationPools[poolId]`)
- `blockType` (`"pm"`/`"control"` accepted case-insensitively, normalized to `"PM"`/`"Control"`)
- `nLevel`
- `trials`
- `activePmCategories`
- `nbackSourceCategories`
- `controlSourceCategories` (optional)
- `pmCount`
- `targetCount`
- `lureCount`
- `minPmSeparation`
- `maxPmSeparation`
- `stimulusVariant` (optional explicit image variant for that block)
- `feedback` (optional per-block override; inherits global `feedback`)
- `beforeBlockScreens` (optional string or string[]; each item renders as an extra continue screen before trials)
- `afterBlockScreens` (optional string or string[]; each item renders as an extra continue screen after block-end summary)

Legacy aliases still accepted for backward compatibility:
- `preBlockInstructions` -> `beforeBlockScreens`
- `postBlockInstructions` -> `afterBlockScreens`

Block structural fields can be token-resolved from core variables at parse time, including:
- `blockType`
- `nLevel`
- `trials`
- `pmCount`, `targetCount`, `lureCount`
- `minPmSeparation`, `maxPmSeparation`
- `stimulusVariant`

This enables concise factor sampling without explicit factorial matrices, e.g.:
- manipulation override: `{ "blockType": "$var.mainBlockType", "nLevel": "$var.mainNLevel" }`
- variables:
  - `mainBlockType`: block-scoped list sampler over `["pm","control"]`
  - `mainNLevel`: block-scoped list sampler over `[1,3]`

At least one block is required.

Optional `plan.manipulations[]` entries can define reusable block overrides:
- `id`
- `overrides` (merged into block before parse)

Optional `plan.manipulationPools` can randomize block assignments without hardcoding per block:
- `poolId: [ [manipA, manipB], [manipC, manipD], ... ]`
- each block with `manipulationPool: "poolId"` draws one bundle
- draws are shuffled and consumed without replacement, then reshuffled if pool is exhausted
- shuffle is participant-seeded (`participantId`, `sessionId`, `variantId`)

### 2.5 `stimuli`

Category map of string arrays. Missing categories are synthesized:
- `pm` (400)
- `control` (400)
- `other` (600)

### 2.6 `stimuliCsv`

Optional CSV stimulus-pool loader:
- `basePath`
- `idColumn` (default `file`)
- `categories` map (`category -> csv filename/path`)

Rows are loaded at runtime and used as category pools.

### 2.7 `imageAssets`

Optional image stimulus templating:
- `enabled`
- `basePath`
- `filenameTemplate` (supports `{id}`, `{variant}`)
- `practiceVariant`
- `mainVariants`
- `mainMode` (`with_replacement` or `cycle`)

When enabled, trial item IDs are resolved to image paths using this template.

### 2.8 `stimulusPools`

Optional pool draw-mode control for identity randomization:
- `nbackDraw`
  - controls non-PM identity draws from the n-back candidate pool
- `pmItemDraw`
  - controls per-category PM/control identity draws
- `pmCategoryDraw`
  - controls which PM/control category is drawn each PM slot

Supported draw modes:
- `ordered`
- `with_replacement`
- `without_replacement`
- `pmCategoryDraw` additionally supports `round_robin`

Defaults preserve prior PM behavior:
- `nbackDraw`: `without_replacement` + `shuffle: true`
- `pmItemDraw`: `without_replacement` + `shuffle: true`
- `pmCategoryDraw`: `round_robin` + `shuffle: true`

### 2.9 `variables`

PM now uses core variable resolution only (no PM-specific shims).

Define participant/block/trial-scoped variables using core samplers and values, then reference them in plan fields:
- `activePmCategories`
- `controlSourceCategories`
- `nbackSourceCategories`

Supported token styles are core-level:
- `$var.name`
- `$sample.name[:count]`
- `$namespace.path` (including nested object paths, e.g. `$between.pm`)

Examples:
- between-subject pair assignment:
  - variable `between` sampled from `[{ "pm": "food", "control": "clothing" }, ...]`
  - block categories use `"$between.pm"` and `"$between.control"`
- multi-PM draws:
  - variable `pm` with list sampler
  - block categories use `"$sample.pm:3"`

### 2.10 `nbackRule`

- `lureLagPasses`
- `maxInsertionAttempts` (default `10`)

### 2.11 `instructions`

- `pages` (preferred): string or string[]
  - aliases: `introPages`, `intro`, `screens`
- `preBlockPages` (string or string[])
- `postBlockPages` (string or string[])
- `endPages` (string or string[])
- `showBlockLabel` (boolean, default `true`; when `false`, hides block label headings on block intro/pre/post and end-of-block screens)
- `preBlockBeforeBlockIntro` (boolean, default `false`; when `true`, pre-block screens render before block intro template)
- `pmTemplate` (`{pmCategoryText}`)
- `blockIntroControlTemplate` (`{nLevel}`)
- `blockIntroPmTemplate` (`{nLevel}`, `{pmCategoryText}`)

Default control text is:
- `This is a {nLevel}-back block. There are no PM trials in this block.`

Notes:
- `pages` is the shared config-level way to define arbitrary intro screens.
- `preBlockPages`/`postBlockPages` are positional shortcuts applied to every block (in addition to each block's `beforeBlockScreens`/`afterBlockScreens`).
- `pmTemplate` can be disabled by setting `""`.
- For any instruction slot, `""` (or arrays containing only blank strings) clears that slot.

Example:
```json
{
  "instructions": {
    "pages": [
      "Welcome.",
      "General n-back response rule.",
      "General PM response rule."
    ],
    "preBlockPages": "Get ready for the next block.",
    "postBlockPages": "Block complete. Brief pause.",
    "endPages": "Task complete. Continue to finish.",
    "showBlockLabel": false,
    "preBlockBeforeBlockIntro": true,
    "pmTemplate": "PM categories for this session: {pmCategoryText}"
  }
}
```

### 2.12 `feedback`

PM uses the shared core feedback module.

Global feedback is parsed from top-level `feedback`.  
Each block can override with `plan.blocks[].feedback`.

Supported fields:
- `enabled`
- `durationMs` / `duration_ms`
- `messages.correct|incorrect|timeout|invalid`
- `messages.byResponseCategory` / `messages.by_response_category`
- `style.correctColor|incorrectColor|timeoutColor|invalidColor` (snake_case accepted)
- `style.byResponseCategoryColors` / `style.by_response_category_colors`
- `style.fontSizePx|fontWeight|canvasBackground|canvasBorder` (snake_case accepted)

Message templates support `{placeholder}` interpolation (for example `{responseCategory}`, `{expectedCategory}`, `{item}`, `{trialType}`, `{blockType}`).

## 3. Block-plan integrity guarantees

`buildBlockPlanWithChecks` retries generation and validates:
- PM slots do not collide with n-back targets.
- target/lure counts are enforced by insertion passes.
- fillers/lures avoid accidental invalid n-back collisions.

Failure after max attempts throws.

## 4. Input handling and correctness

- Allowed keys are `[targetKey, nonTargetKey, pmKey]`.
- jsPsych choices use `toJsPsychChoices` so `space` maps correctly to `" "`.
- jsPsych responses are normalized via `normalizeKey`.
- Trial correctness is computed against normalized `correctResponse`.

## 5. Final payload contract

PM final payload submitted/saved by `finalizeTaskRun`:

```json
{
  "selection": {},
  "mapping": {},
  "timing": {},
  "records": [],
  "events": [],
  "...extras": "runner + optional jsPsychData"
}
```

`extras` currently:
- Native: `{ "runner": "native" }`
- jsPsych: `{ "runner": "jspsych", "jsPsychData": [...] }`

`records` are trial-level response-window rows with:
- participant/variant/block/trial metadata
- stimulus/category fields
- `correctResponse`, `responseKey`, `responseRtMs`, `responseCorrect`
