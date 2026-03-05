# Go/No-Go and Stop-Signal Implementation Plan

## Goal
Add a response-inhibition task package supporting:
1. Go/No-Go mode: response on go trials, withhold on no-go trials.
2. Stop-Signal mode: start as go trial, then on stop trials present a stop cue at sampled stop-signal interval (SSI/SSD), making inhibition the correct behavior if stop appears before response.

Primary stress target: framework support for valid non-response and within-trial state changes that can alter correctness rules.

## Scope
In scope:
1. New task adapter package `tasks/inhibition`.
2. Unified config supporting `mode: gonogo | stopsignal | mixed`.
3. Trial planner with configurable go/no-go/stop proportions and SSD sampling policy.
4. Output with inhibition metrics (success/failure, signal-respond RT, SSD).

Out of scope:
1. Full adaptive staircase for SSD in first pass (fixed distribution first; staircase optional phase 2).
2. Neurophysiology-aligned advanced modeling (SSRT model fitting in-task).

## Proposed Config Model
1. `mapping`:
   - go response key(s), optional multi-key aliases.
2. `timing`:
   - fixation, stimulus onset, response window, trial duration.
   - stop-signal render duration/visual style.
3. `stimulus`:
   - go/no-go target definitions.
   - stop-signal cue appearance (overlay/tone visual placeholder).
4. `stopSignal`:
   - `enabled`, trial probability.
   - `ssdPolicy`: fixed list, sampled distribution, optional staircase placeholder.
5. `plan`:
   - block definitions, trial counts, condition quotas.

## Runtime Design
1. Plan trial rows with fields:
   - `trialKind` (`go|nogo|stop`), `expectedAction`, `ssdMs` (stop only).
2. Render phases:
   - fixation -> go stimulus onset.
   - on stop trials, inject stop cue at `stimulusOnset + ssdMs`.
3. Response capture logic:
   - first response timestamp/key captured.
   - correctness computed from trial kind and stop-cue timing relation to response.
4. Record:
   - go accuracy/RT, no-go commission rate, stop success/failure, signal-respond RT.

## Correctness Rules
1. Go trial: response within window is correct.
2. No-go trial: no response is correct.
3. Stop trial:
   - if response occurs before stop cue onset, classify as pre-signal go response (not inhibition failure).
   - if response occurs after stop cue onset, classify inhibition failure.
   - if no response by response-window end, classify stop success.

## Data Contract
1. `trialKind`, `expectedAction`.
2. `ssdMs`, `stopCueOnsetMs` (stop trials).
3. `responseKey`, `responseRtMs`, `responded` (0/1).
4. `outcomeClass` (`go_correct`, `nogo_correct_withhold`, `stop_success`, `stop_failure`, etc.).
5. `responseCorrect` (binary for compatibility), plus richer class label.

## Stress-Test Focus and Limitations
Current codebase limitations relevant to this task:
1. `captureTimedResponse` captures a first key only and has no built-in concept of “correct omission.”
2. `evaluateTrialOutcome` defaults assume expected response category matching, which is awkward for no-go and stop-signal logic without custom evaluators.
3. `runTrialTimeline` has static stages and cannot schedule intra-stage events (e.g., stop cue appearing mid-response window) as a first-class primitive.
4. No core metadata conventions yet for stop-signal-specific fields (`ssd`, `signalRespond`, inhibition outcome class).

Core-level extensions recommended:
1. Add core response policy modes:
   - `response_required`, `response_forbidden`, `response_contingent`.
2. Extend timeline engine with scheduled within-stage events (e.g., cue injection at relative offset).
3. Add core outcome helpers for inhibition paradigms (go/no-go and stop-signal classification).
4. Add auto-responder profiles aware of inhibition tasks (commission/omission and stop-failure rates), not only generic timeout/error behavior.

## Validation Plan
1. Parser rejects invalid SSD ranges and incompatible mode settings.
2. Planner enforces go/no-go/stop quotas.
3. Outcome classifier correctly separates pre-signal responses from true stop failures.
4. Trials with no response are correctly marked as valid/correct when expected.
5. Deterministic behavior under fixed seeds.
