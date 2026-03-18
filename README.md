# Code to build and copy (change paths):
cd /data/work/Experiments & npm run build -w @experiments/web && rsync -av --delete /data/work/Experiments/apps/web/dist/ /data/work/jatos/study_assets_root/annikaHons/
For JATOS deployment, make a single component, add the repo directory with the above commands, set the html to index.html and the component json to:
```
{
  "taskId": "nback",
  "variantId": "annikaHons",
  "auto": true,
  "overrides": {
    "data": {
      "localSave": false
    }
  }
}
```
Replacing the values as required. Disabling local save ensures no csv is downloaded on the participant side.

# JATOS test auto
pm2 start node --name autoresponder-jatos-once --no-autorestart -- \
    scripts/run-autoresponder-url.mjs \
    --url "http://127.0.0.1:9000/publix/jcyRMNUWs2u?auto=true&auto_mode=data-only" \
    --max-minutes 130 \
    --done-text "Thank you very much for participating"
pm2 status autoresponder-jatos-once
pm2 logs autoresponder-jatos-once --lines 10 --nostream
# Code to run bricks difficulty estimate (from root):
npm run difficulty -w @experiments/task-bricks --config evanderHons --trials 10000 --seed 123456 --no-by-trial-type --no-by-block-trial-type

# Code to extract csv from json
python scripts/jatos_to_long_csv.py temp/annikaHons_jatos_example.txt temp/annikaHons_jatos_example_long.csv
# Experiments Workspace

Unified experiment framework with a shared TypeScript core and task adapters.

## Documentation

- [Docs index](./docs/README.md)
- [Core framework API](./docs/CORE_API.md)
- [Configuration & inheritance](./docs/CONFIGURATION_GUIDE.md)
- [Task: SFT](./docs/TASK_SFT.md)
- [Task: PM](./docs/TASK_PM.md)
- [Task: NBack](./docs/TASK_NBACK.md)
- [Task: Bricks](./docs/TASK_BRICKS.md)
- [Task: Stroop](./docs/TASK_STROOP.md)
- [Task: Tracking](./docs/TASK_TRACKING.md)
- [Bricks runtime config schema](./docs/bricks-runtime-config-schema.md)

## Structure

- `packages/core`: shared runtime, selection, config, scheduler, integration utilities
- `apps/web`: selection-aware browser shell
- `tasks/sft`: SFT (DotsExp) task adapter
- `tasks/pm`: PM task adapter
- `tasks/bricks`: Bricks (DiscoveryProject) task adapter
- `tasks/stroop`: Stroop task adapter
- `tasks/tracking`: continuous tracking task adapter
- `configs/*`: core + task-specific presets

## URL selection

Supported query params:

- `task`: task id (`sft`, `pm`, `nback`, `bricks`, `stroop`, `tracking`)
- `variant`: variant id within task
- `config`: optional task config path override
- `overrides`: URL-encoded JSON override

Participant params:

- `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`, `SONA_ID`, `participant`, `survey_code`

## Dev

```bash
npm install
npm run dev
```

Auto-responder launch example:

```text
http://localhost:5173/?task=sft&variant=default&auto=true
```

Long-run JATOS auto-responder (headless, focus-independent):

```bash
npm run autoresponder:url -- \
  --url "https://<your-jatos-host>/jatos/run?..." \
  --max-minutes 130 \
  --done-text "Thank you very much for participating"
```

Notes:
- If `auto` is missing in the URL, the runner injects `auto=true` by default.
- For JATOS publix start pages that require a launch click, pass `--start-selector "button:has-text('Start')"` if needed.
- Artifacts are written to `temp/autoresponder-runs/<timestamp>/` (`result.json`, screenshot, HTML).

## Design stance

The common framework is the source of truth. Task adapters run natively inside this workspace and do not redirect into external experiment folders.
