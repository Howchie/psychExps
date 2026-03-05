# Tech Stack

## Programming Language
- **TypeScript:** High-level, statically typed language that provides robust type safety and improved developer productivity.

## Build and Tooling
- **Vite:** A fast build tool and dev server that provides an efficient development experience for modern web applications.
- **NPM Workspaces:** For managing a modular monorepo structure with shared core, task-specific adapters, and a web shell.
- **TypeScript (tsc):** For type checking and compiling the monorepo's modules.

## Frontend Libraries
- **jsPsych:** A comprehensive framework for building behavioral experiments in the browser.
- **pixi.js:** A high-performance 2D rendering engine for building complex and performant experimental interfaces.
- **jsquest-plus:** A specialized library for managing experimental questionnaires and participant interactions.

## Core Framework Architecture
- **Shared Core (@experiments/core):** Centralized logic for task scheduling, configuration handling, and data collection. Organized into specialized sub-modules (api, engines, infrastructure, utils, web).
- **ConfigurationManager:** Encapsulated class for robust loading and multi-level merging of experiment configurations.
- **LifecycleManager:** Standardized orchestrator for task execution, ensuring consistent initialization and cleanup.
- **Task Adapters (@experiments/task-*):** Independent modules for implementing specific cognitive and psychological tasks.
- **Standardized TaskAdapter Interface:** Enforces a consistent contract (initialize, execute, terminate) for all task implementations.
- **Unified Browser Shell (@experiments/web):** A single entry point for all experiments, supporting various task configurations via URL parameters.

## Testing and Quality Assurance
- **Playwright:** A robust cross-browser testing framework for validating experiment flows and ensuring consistent behavior.
- **Auto-Responder:** Integration for automated testing and validation of experiment scenarios.

## Development Workflow
- **Standardized Scripts:** Use of `npm run build`, `npm run dev`, and `npm run test:auto` for consistent project operations.
- **Modular Design:** Encourages clean abstractions and reusable components across the codebase.
