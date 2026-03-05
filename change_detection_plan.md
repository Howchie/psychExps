# Change Detection Implementation Plan

## Goal
Add a change-detection task with memory-array style flow:
1. Present `n` stimulus slots for an encoding interval.
2. Delay interval.
3. Probe display where `x <= n` slots are changed or unchanged.
4. Participant reports change vs no-change (or localized change, optional later).

Primary stress target: generalizing trial flow and introducing a reusable dynamic multi-slot stimulus system.

## Scope
In scope:
1. New task adapter package `tasks/change_detection`.
2. Slot-based stimulus generator with configurable set size, slot geometry, and feature dimensions.
3. Trial planner with exact control of change/no-change proportions and number-of-changed-slots.
4. Configurable timing: encoding, retention interval, probe, response window.

Out of scope:
1. Continuous report variants (color wheel recall).
2. Online adaptive set-size staircase.

## Proposed Config Model
1. `mapping`: keys for `change` and `no_change`.
2. `timing`:
   - fixation, encoding, delay, probe onset, response window, trial duration.
3. `stimulus`:
   - `slotCount`, layout template, slot positions.
   - feature pools (color/shape/orientation/etc).
   - optional mask or jitter parameters.
4. `plan`:
   - block list and trials per block.
   - set-size distribution.
   - change probability.
   - changed-slot-count distribution conditional on change trials.
5. `feedback`: optional, core-compatible.

## Runtime Design
1. Per trial, create explicit scene objects:
   - `encodingSlots[]`, `probeSlots[]`, and diff metadata.
2. Render sequence:
   - fixation -> encoding array -> delay blank -> probe array + response.
3. Score via expected category (`change`/`no_change`) and collect RT/accuracy.
4. Persist trial rows with full scene metadata for reproducibility.

## Data Contract
1. `setSize`, `slotCount`.
2. `changed` (0/1), `changedSlotIndices`.
3. `encodingDescriptor`, `probeDescriptor`.
4. `correctResponse`, `responseKey`, `responseRtMs`, `responseCorrect`.
5. block/trial ids and seed-derived reproducibility fields.

## Stress-Test Focus and Limitations
Current codebase limitations relevant to this task:
1. Core stimulus helpers are asset/text oriented and do not provide a shared “scene graph” for slot arrays.
2. `runTrialTimeline` stages are static; dynamic mutation of displayed scene state across encoding/probe is task-local.
3. No shared core schema exists for recording structured trial stimuli (arrays/objects) in a standard way.

Core-level extensions recommended:
1. Add a core `sceneStimulus` model:
   - typed slot/item descriptors plus renderer hooks.
2. Add a core scene diff utility:
   - generate and validate changed vs unchanged probes from encoding arrays.
3. Add a shared serializer for structured trial descriptors to keep downstream analysis consistent across tasks.

## Validation Plan
1. Planner enforces exact change/no-change counts and changed-slot distributions.
2. Probe generation guarantees unchanged trials are truly identical and changed trials differ in configured dimensions.
3. Scene metadata fully reconstructs what was shown.
4. Deterministic generation for fixed seed and config.
