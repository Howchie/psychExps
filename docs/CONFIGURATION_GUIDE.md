# Configuration & Inheritance Guide

This document describes the exact config resolution path implemented in `apps/web/src/main.ts` and `packages/core/src`.

## 1. Precedence Levels

Config objects are merged in the following order (higher items overwrite lower items):

1. **Base object:** `{}`.
2. **Task defaults:** `taskDefaults[taskId]` from `apps/web/src/taskVariantConfigs.ts`.
3. **Variant config:** Selected by variant manifest `configPath`, unless `?config=...` is provided.
4. **Runtime overrides:** `selection.overrides` (JATOS overrides if present, else URL `overrides`).

Current repository state:
- `taskDefaults` is currently empty for all tasks (`sft`, `pm`, `nback`, `bricks`, `stroop`, `tracking`).
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
- jsPsych tasks (`sft`, `pm`, `nback`, `stroop`) run in jsPsych simulation mode.
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

- `pages` (preferred intro pages): string or string[]
  - aliases: `introPages`, `intro`, `screens`
- `preBlockPages`: string or string[] (shown before every block)
- `postBlockPages`: string or string[] (shown after every block)
- `endPages`: string or string[] (shown before final completion screen)

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
