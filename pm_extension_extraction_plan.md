# PM Extension Extraction Plan (No Implementation Yet)

## Goal
Extract PM logic from the current combined PM+NBack paradigm into an optional extension that can compose with any base RT task (for example NBack, SFT), while keeping base-task semantics primary.

## Current State
- `tasks/pm` is monolithic: planning, rendering, response semantics, and PM/NBack correctness live in one adapter.
- PM and NBack are coupled at:
  - trial generation (PM-slot placement + NBack target/lure insertion)
  - expected-response assignment
  - trial-type integrity checks
  - feedback/event metadata

## Target Architecture
1. Base task owns primary trial sequence and primary expected response.
2. PM extension injects secondary contingencies by hooks, not by owning the adapter.
3. Core provides optional hook pipelines so tasks without extensions are unchanged.

## Core Hook Surface (already introduced)
- Trial planning hook pipeline:
  - `applyTrialPlanHooks(trial, context, hooks)`
  - Purpose: extension can annotate/transform planned trials.
- Outcome hook pipeline:
  - `evaluateTrialOutcomeWithHooks({ ..., hooks })`
  - Purpose: extension can override expected-category logic and/or patch outcome fields.

## Proposed PM Extension Contract
- Extension config namespace (example):
  - `extensions.pm.enabled`
  - `extensions.pm.selectionRule` (by category/cue/trial metadata)
  - `extensions.pm.expectedResponseSpec` (key/category/timeout)
  - `extensions.pm.priority` (if multiple extensions alter expected response)
- Extension outputs:
  - `subtaskCorrect.pm` in outcome
  - PM metadata in events/records (`pmActive`, `pmExpectedCategory`, etc.)

## Migration Steps
1. Keep `tasks/pm` unchanged during transition.
2. Establish standalone base paradigms (first `tasks/nback`).
3. Add extension-capable execution paths in target tasks using core hooks.
4. Implement PM extension package (no adapter), applied in config.
5. Parity test against legacy PM task on matched schedules.
6. Deprecate monolithic PM when parity is confirmed.

## Validation Criteria
- Existing tasks run unchanged with zero hooks.
- NBack-only behavior matches expected target/lure/filler scoring.
- PM-extension + NBack reproduces legacy PM correctness/event structure (allowing explicitly documented field renames).
- PM-extension can be toggled on/off without task code changes.

## Risks
- Conflicting expected-response overrides between multiple extensions.
- Event schema drift between legacy PM and extension outputs.
- Trial-generation parity issues if PM insertion logic is moved from adapter to extension layer.

## Mitigations
- Deterministic precedence for extension overrides.
- Compatibility mapping for exported payload fields during migration.
- Seed-locked parity tests for generation + scoring.
