# Task: Stroop Implementation & Config

This document describes the Stroop adapter at `tasks/stroop/src/index.ts`.

## 1. Implementation Details

The Stroop task is implemented using the standardized `TaskAdapter` interface.

### `StroopTaskAdapter` (Class)

- **`initialize(context)`**: Sets up the task context.
- **`execute()`**: Runs the main Stroop task logic using the jsPsych timeline.
- **`terminate()`**: Performs cleanup, including resetting the cursor and removing keyboard scroll blockers.

## 2. Runner behavior

Stroop currently runs `jspsych` via the `LifecycleManager`.

## 2. Config schema currently parsed

Top-level sections consumed:
- `task`
- `mapping`
- `display`
- `timing` (legacy fallback)
- `stimuli`
- `conditions`
- `plan`
- `feedback`

### 2.1 `task`

- `title`
- `instructions`
- `runner` (jsPsych expected)
- `rtTask`
  - `timing.trialDurationMs`
  - `timing.fixationDurationMs`
  - `timing.stimulusOnsetMs`
  - `timing.responseWindowStartMs`
  - `timing.responseWindowEndMs`
  - `responseTerminatesTrial` (default `false`)
  - `postResponseContent` (`stimulus` or `blank`)
  - `feedbackPhase` (`separate` or `post_response`)

Note:
- Stroop currently uses a single intro instruction string from `task.instructions`.
- It does not currently use the shared instruction-slot keys (`instructions.pages`, `preBlockPages`, `postBlockPages`, `endPages`).

### 2.2 `mapping`

Required:
- `redKey`
- `greenKey`

Keys are normalized via core `normalizeKey` and must be distinct.

### 2.3 `display`

- `aperturePx`
- `paddingYPx`
- `cueHeightPx`
- `cueMarginBottomPx`
- `frameBackground`
- `frameBorder`
- `cueColor`
- `fixationColor`
- `fixationFontSizePx`
- `fixationFontWeight`
- `stimulusFontSizePx`
- `stimulusFontWeight`
- `textColorByToken`

Color token validation uses core `createColorRegistry`.

### 2.4 `stimuli`

- `responseColorTokens` (must include `red` and `green`)
- `words` (inline word list)
- `wordsCsv` (`path`, `column`, optional `basePath`)
- `colorLexicon`
  - inline map (`map` or direct object)
  - optional CSV dictionary (`csv.path`, `csv.keyColumn`, `csv.valueColumn`, optional `csv.basePath`)
- `valenceLists`
  - inline: `positive[]`, `neutral[]`, `negative[]`
  - optional CSV columns via `valenceLists.csv.path` and `valenceLists.csv.columns`

### 2.5 `conditions`

- `mode`: `congruence` or `valence`
- `quotaPerBlock`: exact condition counts
- `fontColorQuotaPerBlock`: exact font-color counts
- `maxConditionRunLength`
- `noImmediateWordRepeat`

### 2.6 `plan`

- `blockCount`
- `blockTemplate`
  - `label` (supports `{blockIndex}`)
  - `trials`
  - `feedback` (optional per-block override)
  - `beforeBlockScreens` (optional string or string[]; extra continue screens before each block)
  - `afterBlockScreens` (optional string or string[]; extra continue screens after block-end summary)

Legacy aliases still accepted:
- `preBlockInstructions` -> `beforeBlockScreens`
- `postBlockInstructions` -> `afterBlockScreens`

### 2.7 `feedback`

Uses core shared feedback parsing:
- `enabled`
- `durationMs`/`duration_ms`
- `messages.*`
- `style.*`

## 3. Trial generation model

- Condition sequence uses core `buildConditionSequence` with exact quota weights and max-run constraints.
- Semantic labeling uses core semantic resolver utilities.
- Color token to CSS mapping uses core color registry.
- RT phase durations use core `computeRtPhaseDurations`.

`mode: "congruence"`
- `congruent`: word semantic color equals font color.
- `incongruent`: word semantic color is a response color but does not equal font color.
- `neutral`: word not mapped to a response color.

`mode: "valence"`
- condition is word valence (`positive|neutral|negative`).
- response criterion remains font color.

## 4. Planning ergonomics (what is and is not configurable today)

What is easy in current Stroop config:
- quickly set `plan.blockCount` + `plan.blockTemplate.trials`
- constrain condition and color distributions with:
  - `conditions.quotaPerBlock`
  - `conditions.fontColorQuotaPerBlock`
  - `conditions.maxConditionRunLength`
- include per-block screens with `beforeBlockScreens` / `afterBlockScreens`

What is not currently first-class in Stroop:
- no `design.manipulations` equivalent
- no per-block manipulation assignment schedule (for example alternating trial-type recipes by block)
- `plan.blockTemplate` is one template replicated `blockCount` times

If you need qualitatively different block recipes, current approach is to create separate variants/config files (or runtime overrides) rather than declaring multiple block templates in one Stroop config.

## 5. Output rows

Each response-window trial emits:
- participant + variant fields
- `mode`
- block/trial ids and indices
- `word`
- `wordColorToken`
- `valence`
- `fontColorToken`
- `fontColorHex`
- `conditionLabel`
- `correctResponse`
- `responseKey`
- `responseRtMs`
- `responseCorrect`

## 6. Core friction log

The Stroop implementation was completed without adding new Stroop-specific logic to core. Two generic friction points were encountered and handled task-locally:

1. Multi-constraint allocation gap:
- Core has exact single-factor sequencing (`buildConditionSequence`) and adjacency constraints.
- It does not yet provide a generic joint allocator that simultaneously enforces condition quotas, response-color quotas, and per-cell feasibility.
- Stroop handles this by combining core condition sequencing with local color assignment retries.

2. Multi-column token loading convenience:
- Core CSV loaders can read a single named column per call.
- Emotional Stroop needs multiple semantic columns (`positive`, `neutral`, `negative`) in one file.
- Stroop loads each column through repeated core calls and merges locally.
