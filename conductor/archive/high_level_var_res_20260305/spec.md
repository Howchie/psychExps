# Specification - High-Level Variable Resolution

## Overview
This track aims to move the variable resolution logic (`resolveWithVariables`) from individual task adapter parsers into a higher-level core service. This addresses code review feedback by centralizing logic, improving field coverage, and reducing boilerplate in task adapters.

## Goals
- **Centralized Resolution:** Implement variable resolution at a higher level (e.g., in `ConfigurationManager` or just before `TaskAdapter.initialize`).
- **Cleanup Adapters:** Remove redundant `resolveWithVariables` and `VariableResolver` usage from task adapter parsers (`pm`, `sft`, `nback`, etc.).
- **Improved Coverage:** Ensure that all configuration fields (including nested objects and arrays) are automatically processed for variable tokens.
- **Context Availability:** Ensure that both the task configuration and selection context (participant IDs, etc.) are available when resolving variables.
- **Standardized Injection:** Standardize how the `VariableResolver` is instantiated and used within the task lifecycle.

## Requirements
### Functional
- The core framework MUST automatically resolve `$var`, `$sample`, and namespace tokens in the task configuration before it is passed to `TaskAdapter.initialize`.
- The `VariableResolver` MUST be initialized using the `SelectionContext` (participantId, sessionId, variantId) to ensure consistent seeding.
- Nested structures (objects and arrays) in the configuration MUST be recursively resolved.
- Task adapters MUST receive a fully resolved configuration object, allowing them to focus strictly on task-specific parsing.

### Non-Functional
- Maintain or improve system performance (recursive resolution should be efficient).
- Enhance type safety for configuration processing.
- No regression in existing variable resolution behavior (except for improved coverage of previously missed fields).

## Acceptance Criteria
- [ ] `@experiments/core` contains a centralized mechanism for configuration variable resolution.
- [ ] `ConfigurationManager` or `LifecycleManager` triggers resolution before task initialization.
- [ ] `tasks/pm`, `tasks/sft`, and `tasks/nback` adapters are refactored to remove local resolution logic.
- [ ] Unit tests in `@experiments/core` verify recursive resolution of complex config objects.
- [ ] Verification in the browser confirms that variables (e.g., in `pm modern`) are correctly resolved and displayed.

## Out of Scope
- Changing the syntax of variable tokens.
- Refactoring the core `VariableResolver` or `Sampler` logic itself (only their application point is changing).
