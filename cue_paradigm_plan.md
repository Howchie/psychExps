# Cue Paradigm Implementation Plan

## Goal
Add a new cue-based RT task that can run:
1. Spatial cueing (cue predicts likely stimulus side with configurable reliability).
2. Cued task switching (cue selects decision rule per trial while response buttons stay shared).

Primary stress target: modularity of `rtTask` timing and trial logic when response keys are shared but semantic mappings vary trial-to-trial.

## Scope
In scope:
1. New task adapter package `tasks/cue`.
2. Config-driven support for both cueing modes in one adapter.
3. Trial generator supporting mixed rule blocks and explicit switch/repeat control.
4. Output schema including cue validity, rule id, and semantic response mapping.

Out of scope:
1. Core refactor in this pass (but core extension points are identified below).
2. Adaptive staircasing for cue reliability or switch cost.

## Proposed Config Model
1. `task`: title, runner preference, optional `rtTask` timing override.
2. `mapping`: shared physical keys (e.g., left/right), plus per-rule semantic label map.
3. `cue`:
   - `type`: `spatial | task_rule`.
   - `validity`: probability for valid cues (spatial mode).
   - `set`: cue symbols/assets and their semantic meaning.
   - `cueToStimulusIntervalMs`.
4. `stimuli`:
   - spatial mode: left/right stimulus sources.
   - task-rule mode: stimulus dimensions and rule-relevant attributes.
5. `plan`:
   - block definitions.
   - switch/repeat proportions.
   - validity quotas.
   - optional run-length constraints.
6. `feedback`: use existing core feedback schema.

## Runtime Design
1. Build a trial plan with explicit fields:
   - `cueType`, `cueToken`, `ruleId`, `stimulus`, `correctKey`, `validityLabel`, `switchLabel`.
2. Render trial phases:
   - fixation -> cue -> CTI blank -> stimulus/response window -> optional feedback.
3. Score correctness with `evaluateTrialOutcome` using per-trial expected category derived from active rule.
4. Save trial-level rows and event logs through existing finalization path.

## Data Contract
Each response-window row should include:
1. `blockIndex`, `trialIndex`.
2. `cueToken`, `cueType`, `cueValidity`.
3. `ruleId`, `switchType` (`switch|repeat`).
4. `stimulusDescriptor`.
5. `correctResponse`, `responseKey`, `responseRtMs`, `responseCorrect`.

## Stress-Test Focus and Limitations
Current codebase limitations relevant to this task:
1. `runTrialTimeline`/`runBasicRtTrial` assume static allowed keys and simple stage flow; they do not model trialwise response semantics explicitly.
2. Semantic category mapping is task-local; there is no shared core abstraction for “same key, different meaning by rule.”
3. Condition sequencing exists (`buildConditionSequence`) but cross-factor constraints like “switch + invalid cue quota + no long runs by rule” will likely need task-local logic.

Core-level extensions recommended:
1. Add a core `responseSemantics` abstraction:
   - physical key -> semantic category resolved from per-trial rule context.
2. Add a core `trialPlan` helper for mixed-task/switch designs with exact quotas + adjacency constraints.
3. Extend `runBasicRtTrial` to support explicit cue phase and CTI as first-class options rather than manual stage expansion in every task.

## Validation Plan
1. Parser rejects invalid cue validity values and inconsistent rule mappings.
2. Planner enforces configured switch/repeat and cue validity quotas.
3. Trial scoring remains correct when two consecutive trials map identical keys to different semantics.
4. Deterministic trial generation for fixed participant/session seed.
