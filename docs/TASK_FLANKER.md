# Flanker Task

This document describes the Flanker Task adapter at `tasks/flanker/src/index.ts`.

## Overview

The Eriksen Flanker Task is a cognitive task used to measure selective attention and executive control. Participants must identify the direction of a central target stimulus (e.g., an arrow) while ignoring flanking stimuli that point in the same (congruent) or opposite (incongruent) direction.

## Configuration schema

### `task`
- `title`
- `instructions`: Standard task intro instructions.
- `rtTask`: Core timing configuration (fixation, stimulus onset, response window).

### `mapping`
- `leftKey`: Key bound to the 'left' target response (e.g. `f`).
- `rightKey`: Key bound to the 'right' target response (e.g. `j`).

### `display`
- `aperturePx`: Total frame size.
- `stimulusFontSizePx`: Font size of the arrows.
- `stimulusSpacingPx`: Pixel gap between adjacent symbols.
- `stimulusColor`: CSS color string.

### `stimuli`
- `leftTarget`, `rightTarget`: The character for the central target pointing left or right.
- `leftFlanker`, `rightFlanker`: The character for the directional flankers.
- `neutralFlanker`: The character used for neutral flankers (e.g. `-`).
- `flankerCount`: Number of flankers total. (e.g., 4 = two on the left, two on the right). Even number is enforced.

### `conditions`
- `quotaPerBlock`: Exact counts of `congruent`, `incongruent`, and `neutral` trials per block.
- `maxConditionRunLength`: Max sequential trials of the same condition (default 3).

### `plan`
- `blockCount`: Total number of blocks.
- `blockTemplate.trials`: Trials per block.
- `blockTemplate.feedback`: Feedback display properties (`enabled`, `durationMs`).

## Data Export
Output CSV suffix: `flanker_trials`

Exported Columns include: `conditionLabel`, `targetDirection`, `flankerDirection`, `stimulusString`, `correctResponse`, `responseKey`, `responseRtMs`, `responseCorrect`.
