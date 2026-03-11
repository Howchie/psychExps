# AGENTS.md

## Purpose

This repository is a **central framework for arbitrary cognitive tasks**.
It is not a collection of isolated task apps. It is a shared runtime where tasks are adapters over common infrastructure.

The governing philosophy is:

- Keep the codebase **portable** across deployment contexts, participant platforms, and task domains.
- Keep the codebase **generalizable** so new paradigms reuse existing abstractions.
- Keep task-specific code to the **essential irreducible minimum**.

When adding anything new, the first question is always:

> **Can this be core-level?**

If yes, implement it in core. If not, prove why it must remain task-local.

---

## Repository Shape (Current)

- `packages/core`: shared runtime, config merge/inheritance, scheduler utilities, integration helpers.
- `apps/web`: browser shell and task/variant selection entrypoint.
- `tasks/*`: task adapters (SFT, PM, Bricks, Stroop, etc.).
- `configs/*`: core and task presets/variants.
- `docs/*`: implementation-first documentation.

Core is the source of truth; tasks should consume core mechanisms rather than re-implementing them.

---

## Non-Negotiable Design Principles

1. Core-First
- Prefer one generic feature in `packages/core` over N similar task-specific implementations.

2. Config-Driven
- Prefer configuration and composition over hard-coded branching.
- Avoid introducing new imperative logic when declarative config can express it.

3. Minimal Surface Area
- Add the smallest API needed for multiple tasks.
- Avoid task-named fields in generic pathways when neutral names can work.

4. Backward-Compatible Evolution
- Extend interfaces safely; preserve old keys with aliases/migrations when practical.

5. Separation of Concerns
- Core handles generic runtime behavior.
- Task adapters only encode paradigm semantics that are not meaningfully reusable.

6. Documentation as Contract
- Any behavior change must update docs in `docs/` (and config examples where relevant).

7. Test all changes
- Any files updated should be typechecked
- Wherever possible, automated responder tests should be run on all tasks after changes have been made, to determine whether any dependencies were unwittingly disrupted.

8. JATOS-Deployable By Default
- All experiments must remain deployable through JATOS as a hard core-level requirement.
- Local CSV/JSON save paths exist for testing and debugging, but they are not a substitute for JATOS-compatible data flow.
- Data capture, trial/event emission, and completion/finalization logic that affects JATOS deployment belongs in `packages/core`, not in task-local adapters.

---

## Mandatory Decision Gate: “Can This Be Core-Level?”

Before implementing a feature, run this checklist:

1. Is this behavior plausible in at least one other task?
2. Is the behavior domain-neutral if we rename fields generically?
3. Can it be expressed as generic lifecycle hooks, timeline primitives, config coercion, selection logic, or shared utilities?
4. Would implementing it per-task create duplicated parser/runtime code?
5. Would keeping it task-local make future tasks harder to build?

If most answers are “yes”, implement in core (or shared adapter infrastructure), then wire tasks to it.

If “no”, keep task-local and document why it is irreducibly task-specific.

---

## What Belongs in Core vs Task

### Core-Level Candidates (usually shared)

- Generic lifecycle/screen hooks (`before*`, `after*`, conditional flow primitives).
- Shared config parsing/coercion helpers.
- Selection, participant metadata handling, runtime overrides.
- Common timing/scheduling primitives.
- Generic data/event envelope shape.
- JATOS-compatible data sinks, streaming/batch submission, and finalization behavior.
- Shared validation and schema patterns.

### Task-Level Candidates (usually local)

- Stimulus semantics unique to a paradigm.
- Response scoring that depends on paradigm-only rules.
- Domain-specific trial generation logic with no cross-task analog.
- Paradigm-specific derived metrics that do not generalize.

When unsure, default to core-friendly abstractions and keep task adapters thin.

---

## Implementation Workflow for Agents

1. Inspect existing core abstractions before writing new task logic.
2. Identify duplication opportunities across tasks.
3. Implement reusable pieces first (core/shared utilities).
4. Adapt tasks to consume those pieces with minimal local glue.
5. Preserve compatibility (aliases/migrations) where users likely depend on old config keys.
6. Typecheck/tests for affected packages.
7. Update docs and examples.

---

## Coding Standards

- TypeScript-first, explicit types at boundaries.
- Favor small pure functions for parse/transform utilities.
- Avoid hidden coupling between tasks.
- Do not add task-specific naming to core APIs unless unavoidable.
- Keep config keys semantically neutral where possible.
- Prefer additive changes over breaking changes.

---

## Config Philosophy

- Config is the primary extension mechanism.
- New behavior should be representable in JSON without code forks when practical.
- Task configs should inherit from reusable defaults rather than copy-pasting large blocks.
- If a new config key might serve multiple paradigms, define it generically.

---

## Testing and Validation Expectations

For non-trivial changes:

- Run typecheck in each affected package.
- Run task(s) impacted via local URL variants with auto responder.
- Validate config parsing errors remain informative.
- Verify backward-compatible aliases (if introduced).

Minimum command pattern:

- `npm run typecheck -w @experiments/core`
- plus each affected task package

---

## Documentation Requirements

When behavior changes, update:

1. Task doc(s) in `docs/TASK_*.md` if task-facing behavior changed.
2. `docs/CORE_API.md` or `docs/CONFIGURATION_GUIDE.md` if shared behavior changed.
3. Example config(s) in `configs/*` when adding new capability.

Documentation should describe the current implementation, not aspirational intent.

---

## Anti-Patterns to Avoid

- Duplicating similar parse/runtime logic across multiple tasks.
- Adding one-off task flags when a generic lifecycle field would work.
- Hardcoding flow branches that should be data-driven.
- Introducing breaking config changes without compatibility path.
- Expanding task adapters into mini-frameworks.

---

## PR / Change Review Heuristics

Reviewers and agents should explicitly check:

1. Was core-first evaluation done and documented in the change summary?
2. Could any new task field be renamed and lifted to shared/core scope?
3. Is task-specific code limited to irreducible paradigm logic?
4. Are docs/config examples updated to match implementation?
5. Is the change portable and reusable for future tasks?

---

## Short Policy Statement

This framework exists to make new cognitive tasks cheap to add, easy to maintain, and consistent to run.

To preserve that, always optimize for:

- **Core abstraction over per-task patching**
- **Generalizable design over local convenience**
- **Long-term portability over short-term shortcuts**
