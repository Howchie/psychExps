# Product Guidelines

## Prose Style
- **Clarity and Precision:** Use simple, direct language. Avoid jargon unless necessary, and define it when used.
- **Consistency:** Use consistent terminology across documentation and UI.
- **Professional Tone:** Maintain a helpful and professional tone.
- **Active Voice:** Prefer active voice for instructions and descriptions.

## Branding
- **Name:** "Experiments Framework"
- **Visual Style:** Clean, minimalist, and research-focused.
- **Accessibility:** Ensure all UI elements and documentation are accessible to a diverse range of users.

## User Experience (UX) Principles
- **Modularity First:** Design tasks as independent components that fit seamlessly into the core framework.
- **Configuration-Driven Design:** Prioritize configurability over hard-coding experimental parameters.
- **Fail Fast and Clearly:** Provide meaningful error messages and handle exceptions gracefully to maintain data integrity.
- **Performance:** Optimize for low latency and high-performance experimental interfaces, especially for timing-sensitive tasks.
- **Discoverability:** Ensure that new tasks and configurations are easy for researchers to find and implement.

## Documentation Guidelines
- **Self-Documenting Code:** Write clean, well-commented code.
- **Task-Specific Guides:** Each task adapter must include its own `TASK_<NAME>.md` file detailing its purpose, configuration, and implementation.
- **API Documentation:** Keep the `CORE_API.md` up to date with all changes to the shared core framework.
- **Configuration Examples:** Provide clear and diverse JSON configuration examples for each task.

## Contribution Guidelines
- **TypeScript First:** All new code must be written in TypeScript with proper type safety.
- **Test-Driven Development (TDD):** Encourage writing tests alongside new features and task adapters.
- **Code Review:** All contributions must undergo a peer review process to ensure high quality and consistency.
- **Modular Refactoring:** Regularly refactor the core framework to maintain modularity and reduce technical debt.
