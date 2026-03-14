# Task: Change Detection

This document describes the implementation and configuration of the Change Detection task adapter.

## 1. Implementation Details

The task uses a memory-array paradigm where participants encode a set of stimuli, wait for a delay, and then identify if an item has changed in a probe display.

### Core Framework Enhancements

This task leverages several core enhancements implemented for the Change Detection paradigm:
- **`SpatialLayoutManager`**: Handles non-overlapping programmatic positioning of stimuli.
- **`SceneRenderer`**: Provides standardized canvas rendering for structured scenes.
- **`runCustomRtTrial`**: Allows for dynamic, multi-phase trial structures (Fixation -> Encoding -> Delay -> Probe).
- **`runTaskSession`**: Manages the high-level task lifecycle, including instructions and blocks.

## 2. Configuration Schema

The task is configured via JSON. Below is the schema for the `taskConfig`:

### `timing`
- `fixationMs`: Duration of the fixation cross.
- `encodingMs`: Duration of the encoding stimulus display.
- `delayMs`: Duration of the blank delay interval.
- `probeMs`: Maximum duration of the probe display.

### `stimulus`
- `layout`:
    - `type`: `"circular"`, `"grid"`, or `"random"`.
    - `radius`: Radius for circular layout (default: 200).
    - `padding`: Minimum padding between items in random layout.
- `items`:
    - `type`: `"shape"` (Images coming soon).
    - `shapes`: Array of allowed shapes (e.g., `["circle", "square"]`).
    - `colors`: Array of allowed colors (e.g., `["red", "blue"]`).

### `plan`
Defines the blocks and trial distributions.
- `blocks`: Array of block configurations.
    - `trials`: Total trials in block.
    - `changeProbability`: Probability of a "change" trial (default: 0.5).
    - `setSizes`: Array of set sizes to sample from (e.g., `[4, 6, 8]`).
    - `label` (optional block label)
    - `beforeBlockScreens` / `preBlockInstructions` (optional pre-block screens)
    - `afterBlockScreens` / `postBlockInstructions` (optional post-block screens)

### `instructions`
Change Detection now uses shared core instruction-slot keys:
- intro: `pages|introPages|intro|screens`
- pre-block: `preBlockPages|beforeBlockPages|beforeBlockScreens`
- post-block: `postBlockPages|afterBlockPages|afterBlockScreens`
- end: `endPages|outroPages|end|outro`

Additional controls:
- `blockIntroTemplate` (supports `{blockLabel}` and `{nTrials}`)
- `showBlockLabel` (default `true`)
- `preBlockBeforeBlockIntro` (default `false`)

## 3. Data Output

The task generates both JSON and CSV data.

### JSON Payload
Includes the full `sessionResult` with detailed trial-level metadata, including:
- `setSize`: Number of items in the trial.
- `isChange`: Boolean indicating if the trial was a change trial.
- `rtMs`: Response time in milliseconds.
- `key`: The key pressed by the participant.
- `responseCorrect`: `1` for correct, `0` for incorrect.
- `diff`: Details of the change (indices of changed items).

### CSV Output
A flattened version of the trial results (`trials.csv`) for easier analysis in R or Python.
