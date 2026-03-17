# Task: Go/No-Go

The Go/No-Go task adapter implements the classic cognitive control task.

## Configuration Schema

The task configuration supports defining the following under the `task` object:

- `title`: String for the task title.
- `instructions`: Standard instructions object (`beforeTaskScreens`, `afterTaskScreens`).
- `mapping`: Object containing `goKey` (the key to press for "go" stimuli, typically `" "`).
- `stimuli`: Object defining arrays of `goStimuli` (e.g., `["O"]`) and `noGoStimuli` (e.g., `["X"]`).
- `blocks`: Array of block definitions, each with:
  - `id`: Unique identifier.
  - `trials`: Number of trials in the block.
  - `goRatio`: Number between 0.0 and 1.0 representing the proportion of "go" trials (e.g., `0.8` for 80% Go / 20% No-Go).
  - `beforeBlockScreens`: Optional instructions to show before the block starts.

## Outputs

Metrics exported in `experiment_end` summary:
- `hits`: Correct presses for "go" stimuli.
- `misses`: Failed presses for "go" stimuli.
- `falseAlarms`: Incorrect presses for "no-go" stimuli.
- `correctRejections`: Correct withholding of response for "no-go" stimuli.
- `hitRate`: `hits / totalGo`.
- `falseAlarmRate`: `falseAlarms / totalNoGo`.
