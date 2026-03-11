# Configuration & Inheritance Guide

This document describes the exact config resolution path implemented in `apps/web/src/main.ts` and `packages/core/src`.

## 1. Precedence Levels

Config objects are merged in the following order (higher items overwrite lower items):

1. **Base object:** `{}`.
2. **Task defaults:** `taskDefaults[taskId]` from `apps/web/src/taskVariantConfigs.ts`.
3. **Variant config:** Selected by variant manifest `configPath`, unless `?config=...` is provided.
4. **Runtime overrides:** `selection.overrides` (JATOS overrides if present, else URL `overrides`).

Current repository state:
- `taskDefaults` is currently empty for all tasks (`sft`, `nback_pm_old`, `nback`, `bricks`, `stroop`, `tracking`).
- Effective baseline behavior therefore comes from the selected variant config JSON.

### Merger Behavior: `buildMergedConfig`

The framework uses a deep merge (`deepMerge`). Overriding one nested key does not replace sibling keys in that object.

---

## 2. Using Runtime Overrides

Runtime overrides allow you to modify an experiment without changing any JSON files.

### Via URL Parameters

You can pass a URL-encoded JSON object as the `overrides` parameter.

**Example:** Increase the response deadline for SFT.
```text
http://localhost:5173/?task=sft&variant=default&overrides=%7B%22timing%22%3A%7B%22response_deadline_ms%22%3A5000%7D%7D
```

### Via JATOS

In a JATOS study, place your overrides in the **Component JSON Input**.
```json
{
  "overrides": {
    "mapping": {
      "targetKey": "k"
    }
  }
}
```

If both JATOS and URL overrides are present, JATOS overrides win.

---

## 3. Auto-responder (Synthetic Participant)

You can enable a built-in auto-responder to run long synthetic sessions for QA and data pipeline testing.

### URL toggle

Use the same launch URL with `auto=true`:

```text
http://localhost:5173/?task=stroop&variant=default&auto=true
```

Accepted truthy/falsy values:
- truthy: `1`, `true`, `yes`, `on`
- falsy: `0`, `false`, `no`, `off`

### Config shape

Global defaults belong in core config (`configs/core/default.json`), and task configs may override with an `autoresponder` object.

```json
{
  "autoresponder": {
    "enabled": false,
    "continueDelayMs": { "minMs": 800, "maxMs": 2600 },
    "responseRtMs": { "meanMs": 720, "sdMs": 210, "minMs": 180, "maxMs": 3200 },
    "timeoutRate": 0.08,
    "errorRate": 0.12,
    "interActionDelayMs": { "minMs": 450, "maxMs": 1200 },
    "holdDurationMs": { "minMs": 220, "maxMs": 860 },
    "maxTrialDurationMs": 90000
  }
}
```

Resolution order:
1. `coreConfig.autoresponder`
2. `taskConfig.autoresponder`
3. URL `auto=...` (final override for enabled/disabled)

Behavior:
- jsPsych tasks (`sft`, `nback_pm_old`, `nback`, `stroop`) run in jsPsych simulation mode.
- Continue screens auto-advance with sampled delays.
- Native Bricks auto-starts, applies synthetic holds, and enforces a max trial duration guard in auto mode.

---

## 4. UI Surface: Page Background

The shell background outside task stimulus frames is configurable.

Keys:
- `coreConfig.ui.pageBackground` (global default)
- `taskConfig.ui.pageBackground` (per-task/per-variant override)

Precedence:
1. `taskConfig.ui.pageBackground`
2. `coreConfig.ui.pageBackground`
3. CSS default in `apps/web/src/styles.css`

Examples:

Core default (`configs/core/default.json`):
```json
{
  "ui": {
    "pageBackground": "#f8fafc"
  }
}
```

Task override (`configs/pm/annikaHons.json`):
```json
{
  "ui": {
    "pageBackground": "#ffffff"
  }
}
```

---

## 5. Redirect Templates

The framework supports dynamic redirect URLs upon completion. These are configured in the `completion.redirect` section of the core config.

### Supported Tokens:
- `{participantId}`, `{studyId}`, `{sessionId}`: Standard IDs.
- `{PROLIFIC_PID}`, `{STUDY_ID}`, `{SESSION_ID}`: Prolific-specific IDs.
- `{survey_code}`: The completion code found in the selection context.
- `{taskId}`, `{variantId}`: The identifiers for the current task.

**Example Config:**
```json
{
  "completion": {
    "redirect": {
      "enabled": true,
      "completeUrlTemplate": "https://app.prolific.com/submissions/complete?cc={survey_code}&pid={PROLIFIC_PID}"
    }
  }
}
```

---

## 6. Instruction Slots (Shared Pattern)

For tasks that use the shared instruction-slot parser (`pm`, `nback`, `tracking`), `instructions` supports:

- `pages` (preferred intro pages): string, object, or array
  - aliases: `introPages`, `intro`, `screens`
- `preBlockPages`: string, object, or array (shown before every block)
- `postBlockPages`: string, object, or array (shown after every block)
- `endPages`: string, object, or array (shown before final completion screen)

Instruction page object shape:
- `text`: plain text (escaped)
- `html`: raw HTML fragment
- `title`: optional heading for that page
- `actions`: optional button array for that page
  - each action: `{ "id"?: string, "label": string, "action"?: "continue" | "exit" }`
  - `"exit"` halts the task flow immediately and does not run completion finalization/redirect.

Resolution behavior:
- Slot aliases are checked in priority order, and the first key that is explicitly present is used.
- `""` (or arrays like `[""]`) intentionally clear that slot and prevent fallback to inherited/default pages.
- Blank array entries are ignored.

Example:
```json
{
  "instructions": {
    "pages": [
      "Welcome.",
      "This session includes N-back and PM responses.",
      "Press continue when ready."
    ],
    "preBlockPages": "Stay focused and keep your fingers on response keys.",
    "postBlockPages": "Take a brief pause before continuing.",
    "endPages": [
      "You have completed all blocks.",
      "Please continue to the final completion screen."
    ]
  }
}
```

### 6.1 Instruction Insertions (Generalized)

For tasks that use the core orchestrator (including NBack), you can insert additional instruction pages at specific lifecycle points using:

- `instructions.insertions`: array of insertion specs

Insertion spec fields:
- `at`: insertion point (required)
- `pages`: string/object or array (required)
- `id`: optional label for readability
- `when`: optional block filter
  - `blockIndex`: number[]
  - `blockLabel`: string[]
  - `blockType`: string[]
  - `isPractice`: boolean

Supported `at` values:
- `task_intro_before`
- `task_intro_after`
- `block_start_before_intro`
- `block_start_after_intro`
- `block_start_after_pre`
- `block_end_before_post`
- `block_end_after_post`
- `task_end_before`
- `task_end_after`

Notes:
- Multiple insertion specs at the same `at` point are supported and run in array order.
- `when` filters apply to block-level insertion points.
- Insertion pages are resolved through the task variable resolver, including block-local context where available.

Example:
```json
{
  "instructions": {
    "pages": ["Welcome."],
    "preBlockPages": "Get ready.",
    "insertions": [
      { "at": "task_intro_before", "pages": ["Consent reminder."] },
      {
        "at": "task_intro_before",
        "pages": [
          {
            "title": "Consent",
            "html": "<iframe src=\"/assets/pm-words/consent.html\" style=\"width:min(980px,96vw);height:70vh;border:1px solid #ccc;border-radius:8px;\"></iframe>",
            "actions": [
              { "label": "I Consent", "action": "continue" },
              { "label": "Disagree (exit study)", "action": "exit" }
            ]
          }
        ]
      },
      {
        "at": "block_start_after_intro",
        "pages": ["Remember PM response for this block."],
        "when": { "blockType": ["pm"], "isPractice": false }
      },
      { "at": "task_end_before", "pages": ["Almost done."] }
    ]
  }
}
```

---

### 6.2 Block Retry Loops (Core Orchestrator)

For tasks that run through the core orchestrator (including NBack), blocks can define:

- `repeatUntil`: optional object on a block

Fields:
- `enabled` (default `true` when object is present)
- `maxAttempts` (integer, default `1`)
- `minAccuracy` (0..1) or `minAccuracyPct` (0..100)
- `minCorrect` (optional integer)
- `minTotal` (optional integer)
- `where` (optional trial filter object, same shape as block-summary filtering)
- `metrics.correctField` (field used for correct/incorrect scoring; `true`/`1` count as correct)

Example:
```json
{
  "plan": {
    "blocks": [
      {
        "label": "Practice",
        "trials": 20,
        "repeatUntil": {
          "maxAttempts": 3,
          "minAccuracy": 0.8,
          "where": { "trialType": ["N"] },
          "metrics": { "correctField": "responseCorrect" }
        }
      }
    ]
  }
}
```

Notes:
- Evaluation is attempt-local and computed from that attempt's trial results.
- Retries stop as soon as thresholds are met or `maxAttempts` is reached.
- Default post-block pages (`afterBlockScreens` / task-level post-block pages) are shown on the final attempt only.
- Use `repeatAfterBlockScreens` (alias `repeatPostBlockScreens`) on a block for retry-attempt messaging.

---

## 7. Variable Resolution

The framework supports dynamic variable resolution and sampling in task configurations via the core `VariableResolver`.

### High-Level Resolution

When a task is launched, the `LifecycleManager` automatically resolves variable tokens in the merged configuration *before* passing it to the task adapter's `initialize` method.

**Important Scope Note:**
- Only **`participant`** scoped variables are resolved at this high level.
- **`block`** and **`trial`** scoped variables are left as tokens (e.g., `"$var.myVar"`) so that task adapters can resolve them dynamically during the experiment lifecycle.

### Defining Variables

Variables are defined in the `variables` section of the task configuration.

```json
{
  "variables": {
    "betweenGroup": {
      "scope": "participant",
      "sampler": {
        "type": "list",
        "values": ["A", "B"]
      }
    },
    "difficulty": {
      "scope": "block",
      "sampler": {
        "type": "list",
        "values": [1, 2, 3]
      }
    }
  }
}
```

### Supported Tokens

- **`$var.name`**: Direct variable reference.
- **`$sample.name[:count]`**: Samples from a variable (uses the variable's sampler).
- **`$namespace.path`**: References values from a specific namespace (e.g., `$local.itemId` or `$between.condition`).

### String Interpolation

In addition to full-token fields, any string value resolved through the core resolver can interpolate variable expressions with `${...}`.

- `${var.name}`: interpolate a variable value.
- `${namespace.path}`: interpolate values from a namespace.

Examples:

```json
{
  "variables": {
    "pmCategory": "animals",
    "between": {
      "controlSuffix": "controls"
    }
  },
  "plan": {
    "blocks": [
      {
        "nbackSourceCategories": ["${var.pmCategory}_${between.controlSuffix}"]
      }
    ]
  }
}
```

Notes:
- Existing full-token behavior is unchanged (`"$var.name"` still resolves as before).
- Interpolation is string-oriented; unresolved expressions are left unchanged.

### Namespace Support

The framework supports several namespaces:
- `var`: The default namespace for variables defined in the config.
- `local`: Local values provided by the task adapter during dynamic resolution (e.g., trial-level data).
- Custom namespaces: Can be registered by task adapters.

---

## 8. Troubleshooting Configuration

If your config changes aren't taking effect, check the following:

1. **Isolation Check:** The framework validates `taskConfig` isolation. Root-level keys belonging to *other* tasks (e.g., putting `mapping` in an SFT config) are rejected by `validateTaskConfigIsolation`.
2. **Schema Errors:** Check the browser console. The parsers (`parseSftConfig`, `parsePmConfig`) will throw descriptive errors if required sections are missing or malformed.
3. **Variant source:** `?config=...` replaces variant manifest mapping for that launch.
4. **Runtime source precedence:** JATOS input overrides URL `overrides`.

---

## 9. Stimulus Export Mode (No Full Run)

The web shell supports a planning/export mode for parity and audit workflows.

Use URL flag:
- `exportStimuli=true` (or `export_stimuli=true`)

Supported tasks:
- `nback`
- `nback_pm_old`

Behavior:
- Task runtime builds planned blocks/trials but skips trial execution.
- A CSV is downloaded with planned stimuli and response coding fields (including `trial_code` values like `pm`, `lure_<n>`, `target`, `non_target`).

---

## 8. Trial/Manipulation Planning Surfaces (Current)

Current planning capabilities are task-specific on top of shared core scheduling primitives:

- Shared core primitive:
  - `buildScheduledItems` supports `weighted`, `sequence`, `quota_shuffle`, `block_quota_shuffle`.
  - shared pool runtime supports seeded source loading and draw modes (`ordered`, `with_replacement`, `without_replacement`, plus category `round_robin`).
- SFT:
  - block-level manipulation assignment via `design.blocks[].manipulation` or `manipulationPool`
  - within-block trial-type composition via `design.manipulations[].trial_plan.variants[]` + `trial_plan.schedule`
- Stroop:
  - balanced condition construction via quotas + adjacency constraints
  - replicated block template (`plan.blockCount` + `plan.blockTemplate`)
  - no manipulation-plan layer in current Stroop schema

If your goal is “define a few trial types, then combine/schedule them across blocks,” SFT exposes this directly; Stroop currently does not expose an equivalent manipulation layer.

For stimulus identity pools (e.g. NBack/PM category item draws), use task `stimulusPools` draw config where available:
- `nbackDraw`
- `pmItemDraw`
- `pmCategoryDraw`

---

## 9. Local Data Output Format

Core local-save behavior is controlled by `data.localSaveFormat`:

```json
{
  "data": {
    "localSave": true,
    "filePrefix": "experiments",
    "localSaveFormat": "csv"
  }
}
```

Supported values:
- `csv` (default): local CSV download
- `json`: local JSON download
- `both`: local CSV + JSON download

JATOS submission is unaffected by this setting. When JATOS is available, core emits incremental JSON-lines data through its sink path and still preserves local save behavior for testing.

---

## 10. Generic Stimulus Injection Module

Core provides a reusable module for injecting trials into an existing task plan:

- config path: `task.modules.injector`
- module id: `injector`

Minimal shape:
```json
{
  "task": {
    "modules": {
      "injector": {
        "enabled": true,
        "injections": [
          {
            "id": "example",
            "schedule": { "count": 3, "minSeparation": 6, "maxSeparation": 10 },
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

Source modes:
- `category_in`: draws from loaded stimulus pools by category name.
- `literal`: draws from `source.items` inline list.
- `sourceDraw`: controls draw behavior for injected items.
  - `mode`: `without_replacement` (default), `with_replacement`, `ordered`
  - `scope`: `block` (default), `participant`
  - `shuffle`: defaults to `true`
  - `without_replacement` recycles automatically once exhausted.

Setter fields:
- `set.trialType` (optional)
- `set.itemCategory` (optional)
- `set.correctResponse` (optional)
- `set.responseCategory` (optional semantic label used for module response semantics)
