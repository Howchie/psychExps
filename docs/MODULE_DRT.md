# Module: Detection Response Task (DRT)

The Detection Response Task (DRT) module implements ISO-standard and custom detection tasks (visual, auditory, tactile) that run concurrently with a primary task.

## 1. Configuration (`task.modules.drt`)

| Field | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `enabled` | boolean | `false` | Whether the module is active. |
| `scope` | `"block" \| "trial"` | `"block"` | `"block"`: DRT runs continuously. `"trial"`: DRT starts/stops per trial. |
| `key` | string | `"space"` | The response key for DRT probes. |
| `responseWindowMs` | number | `1500` | Maximum time allowed to respond to a probe. |
| `displayDurationMs` | number | `1000` | Duration the probe remains visible/audible. |
| `responseTerminatesStimulus` | boolean | `true` | If true, a valid response hides the probe immediately. |
| `isiSampler` | object | (Required) | Sampler spec for Inter-Stimulus Interval (ISI). |
| `stimMode` | string | `"visual"` | Primary mode: `"visual"`, `"auditory"`, or `"border"`. |
| `stimModes` | array | `[]` | Optional array to enable multiple concurrent modes (e.g., `["visual", "auditory"]`). |
| `parameterTransforms` | array | `[]` | Online modeling configurations (e.g., `wald_conjugate`). |
| `transformPersistence` | `"scope" \| "session"` | `"scope"` | Controls if parameter estimates persist across block boundaries. |
| `dataOnlySimulationDurationMs` | number | inferred/fallback | Optional virtual-time duration used only when autoresponder is enabled with `auto_mode=data-only`. |

### 1.1 ISI Sampler (`isiSampler`)

The ISI is the time between the end of one probe (or response) and the start of the next.
```json
"isiSampler": {
  "type": "uniform",
  "min": 3000,
  "max": 5000
}
```

### 1.2 Presentation Modes

#### Visual (`visual`)
Configures a standard visual probe (e.g., a square/circle at the top of the screen).
```json
"visual": {
  "shape": "square",
  "color": "#dc2626",
  "sizePx": 32,
  "topPx": 16
}
```

#### Auditory (`audio`)
Configures a tone probe.
```json
"audio": {
  "volume": 0.25,
  "frequencyHz": 900,
  "durationMs": 120,
  "waveform": "sine"
}
```

#### Border Flash (`border`)
Configures a flashing border around the stimulus area (less intrusive than a dedicated probe).
```json
"border": {
  "color": "#dc2626",
  "widthPx": 4,
  "target": "display"
}
```

## 2. Parameter Transforms

The DRT module can run real-time parameter estimation on response latencies.

- **`wald_conjugate`**: Estimates Drift Rate and Threshold parameters from a moving window of DRT RTs using a Bayesian Wald-conjugate model.

```json
"parameterTransforms": [
  {
    "type": "wald_conjugate",
    "window": 20,
    "prior": { "drift": 2.5, "threshold": 1.0 }
  }
]
```

## 3. Data Output

DRT results are exported in the `moduleResults` object under the key `drt`.

- **`engine.events`**: Full log of DRT events (`drt_stimulus_presented`, `drt_hit`, `drt_miss`, `drt_false_alarm`).
- **`engine.stats`**: Summary counts (hits, misses, false alarms).
- **`transforms`**: Runtime data from parameter estimators.
- **`responseRows`**: Row-level RT and parameter data for each response.

## 4. Auto-Responder Integration

When auto mode is enabled (`auto=true` or `autoresponder.enabled=true`), DRT generates synthetic key responses using the shared auto-response profile (RT distribution and timeout rate).

- `auto_mode=visual`: normal live DRT runtime is used.
- `auto_mode=data-only`: DRT module uses a virtual-time simulation path built on the same DRT engine/output pipeline, so module stats/events/response rows are still produced without waiting for wall-clock trial time.

For data-only mode, `dataOnlySimulationDurationMs` can be set explicitly per scope. If omitted, core infers a duration from trial/block config fields where possible and otherwise uses conservative fallbacks.
