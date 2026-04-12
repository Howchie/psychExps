# Module: Prospective Memory (PM)

The Prospective Memory (PM) module is a reusable component that can be plugged into any task supporting the core module runner. It automates the injection of PM trials based on semantic rules and manages PM-specific response mapping.

## 1. Configuration (`task.modules.pm`)

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | boolean | `false` | Whether the module is active for the current task/block. |
| `eligibleTrialTypes` | string[] | `null` | Array of base trial types that can be converted to PM (e.g., `["F"]`). If null, all trials are eligible. |
| `schedule` | object | (Required) | Controls the frequency and spacing of PM trials. |
| `rules` | array | (Required) | Defines the cues that trigger a PM response. |
| `captureResponses` | boolean | `false` | If true, the module independently captures PM keypresses (advanced). |

### 1.1 Schedule (`schedule`)

- `count`: Number of PM trials to inject into the block.
- `minSeparation`: Minimum number of trials between PM events.
- `maxSeparation`: Maximum number of trials between PM events.

### 1.2 Rules (`rules[]`)

The module supports multiple rule types to define PM cues.

#### Category Match (`category_in`)
Triggers when the trial's stimulus category matches one of the specified categories.
```json
{
  "type": "category_in",
  "categories": ["animals", "fruits"],
  "responseKey": "space"
}
```

#### Text Prefix (`text_starts_with`)
Triggers when the stimulus text starts with a specific prefix.
```json
{
  "type": "text_starts_with",
  "prefixes": ["un", "pre"],
  "responseKey": "p",
  "caseSensitive": false
}
```

#### Stimulus Color (`stimulus_color`)
Triggers based on the rendering color of the stimulus.
```json
{
  "type": "stimulus_color",
  "colors": ["#ff0000", "red"],
  "responseKey": "r"
}
```

#### Flag Match (`flag_equals`)
Triggers when a custom flag in the trial context matches a value.
```json
{
  "type": "flag_equals",
  "flag": "isLure",
  "value": true,
  "responseKey": "l"
}
```

## 2. Integration Mechanics

1.  **Plan Transformation:** During the `Research` phase (block plan generation), the PM module intercepts the plan and replaces eligible trials with `trialType: "PM"`.
2.  **Semantic Mapping:** The module automatically adds its `responseKey`s to the task's allowed key set for blocks where the module is enabled.
3.  **Locking:** Injected PM trials are marked `locked: true` so downstream injectors/samplers can preserve them.

If `schedule.count > 0` but no eligible positions exist, PM placement throws an explicit error.
3.  **Correctness:** Host tasks (like N-Back) query the module's semantics to determine the `correctResponse` for a given trial.

## 3. Data Output

PM module data is exported in the `moduleResults` object of the final JSON payload under the key `pm`.

- **`responses`**: Array of raw PM keypress events captured by the module (if `captureResponses` is enabled).
- **Trial Records:** In the main trial CSV, PM trials are identified by `trialType: "PM"` (or as configured by the host task).
