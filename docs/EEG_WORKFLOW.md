# EEG Workflow (Local Bridge + Optional LSL + LabRecorder)

This repo now supports an opt-in EEG marker bridge designed for local/on-site studies.

The bridge is intentionally core-level and task-agnostic:
- task code does not need to start/stop bridge services
- session lifecycle events can be forwarded to a local process
- local marker logs are written automatically
- LSL outlet forwarding is optional
- LabRecorder remote control is optional

## 1. Quick Start

Single-command local session (recommended for students):

```bash
npm run eeg:session
```

This starts:
1. local EEG bridge (`scripts/eeg-bridge.mjs`)
2. web shell dev server (`@experiments/web` via Vite)

If you only want bridge:

```bash
npm run eeg:bridge
```

## 2. Enable EEG for a Study

Set `eeg` in your selected task config (or core config):

```json
{
  "eeg": {
    "enabled": true,
    "bridgeUrl": "http://127.0.0.1:8787",
    "requireBridge": true,
    "eventTypes": ["task_start", "task_end", "trial_start", "trial_end"],
    "includeEventPayload": false
  }
}
```

Notes:
- `requireBridge: true` blocks experiment launch if bridge is not reachable.
- Event forwarding is currently session lifecycle-level. Fine-grained stimulus-onset hooks can be added later in core.

## 3. Marker Logging and LSL

Bridge behavior:
- writes NDJSON marker logs to `temp/eeg-marker-logs/`
- receives events at `POST /event`
- exposes health at `GET /health`
- can be re-bound with `EEG_BRIDGE_HOST` / `EEG_BRIDGE_PORT`

LSL forwarding:
- bridge attempts dynamic import of `node-labstreaminglayer`
- if unavailable, bridge still runs and writes local marker logs

Install optional LSL dependency on EEG machines:

```bash
npm install node-labstreaminglayer
```

## 4. Optional LabRecorder Remote Control

LabRecorder can be remote-controlled through its TCP RC endpoint.

Enable RC for bridge process:

```bash
EEG_ENABLE_LABRECORDER_RC=1 npm run eeg:session
```

Optional environment variables:
- `EEG_LABRECORDER_HOST` (default `127.0.0.1`)
- `EEG_LABRECORDER_PORT` (default `22345`)
- `EEG_LABRECORDER_ROOT` (optional)
- `EEG_LABRECORDER_TEMPLATE` (default `%p_%s_%b.xdf`)

When RC is enabled, bridge sends:
- on session start: `select all`, `filename ...`, `start`
- on session end: `stop`

## 5. Suggested Student Workflow

1. Run `npm run eeg:session`.
2. Open bookmarked localhost task URL.
3. Verify bridge health (`http://127.0.0.1:8787/health`) if needed.
4. Run participant.

With `requireBridge: true`, launching without bridge is blocked at startup.
