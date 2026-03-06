# Specification - Change Detection Paradigm

## Overview
This track implements a generalized "Change Detection" task and enhances the core framework to support multi-phase trial structures and programmatic spatial layouts. The goal is to provide a highly modular implementation that leverages shared core services for stimulus pools, trial handling, and spatial positioning.

## Goals
- **Enhanced Core Trial Flow:** Extend `rtTask` or create a generalized multi-phase stage runner to support complex trial sequences (e.g., Encode -> Mask -> Delay -> Test).
- **Core Spatial Layout Utility:** Implement a `SpatialLayoutManager` to handle non-overlapping programmatic positioning of stimuli ("slots").
- **Structured Scene Model:** Introduce a `SceneStimulus` model to describe and diff structured trial states (e.g., identity changes in a subset of slots).
- **Change Detection Task Adapter:** Create a new `tasks/change_detection` adapter that utilizes these core enhancements.

## Functional Requirements
- **Multi-Phase Support:** The framework MUST support a dynamic sequence of display phases per trial, each with its own duration and stimulus set.
- **Programmatic Slots:** Slots MUST be able to be positioned randomly or via fixed templates (e.g., compass points) without visual overlap.
- **Stimulus Integration:** Support both Images (from CSV/Pools) and Shapes (canvas-drawn) within slots.
- **Change Logic:** Support "same/different" response logic based on identity changes in `x` out of `n` slots.
- **Data Persistence:** Trial results MUST include full scene metadata (encoding vs. probe descriptors) for reproducibility.

## Non-Functional Requirements
- **Task Neutrality:** Core enhancements SHOULD be reusable by other tasks (e.g., using `SpatialLayoutManager` for SFT or cueing).
- **Deterministic Seeding:** All random positioning and sampling MUST be deterministic based on the participant/session seed.
- **Performance:** Ensure minimal latency in multi-phase transitions.

## Acceptance Criteria
- [ ] `@experiments/core` supports generalized multi-phase trial structures.
- [ ] `SpatialLayoutManager` is implemented and verified with non-overlapping constraints.
- [ ] `tasks/change_detection` correctly implements the encoding-delay-probe flow.
- [ ] Trial data includes precise scene descriptors and change metadata.
- [ ] Automated tests verify deterministic layout and identity diffing.

## Out of Scope
- Continuous report variants (e.g., color wheel recall).
- Online adaptive staircasing for set-size.
- 3D stimulus rendering.
