# Repository Guidelines

## Project Structure & Module Organization

This repository is currently an empty starting point: no application code, tests, assets, or dependency manifests have been committed. When introducing the initial implementation, document the chosen language, framework, and directory layout in `README.md`.

Keep application code, tests, and static assets in clearly named directories, such as `src/`, `tests/`, and `assets/`, if appropriate to the chosen stack. Group related puzzle logic together and separate it from presentation code.

## Build, Test, and Development Commands

No build, test, or local development commands are configured yet. When adding tooling, provide repeatable commands through the stack’s standard task runner and document them in `README.md`. Include dependency installation, local development, production builds, and test execution. Do not assume commands such as `npm test` exist until their configuration is committed.

## Coding Style & Naming Conventions

Follow the conventions of the language and framework selected for the project. Configure a formatter and linter early, and use them consistently. Choose descriptive names for puzzle rules, state, and validation functions. Keep functions focused and avoid mixing puzzle generation with user interface behavior. Document indentation and file naming rules when the initial stack is established.

## Testing Guidelines

No test framework or coverage threshold exists yet. Add tests alongside new behavior and document how to run them. Prioritize puzzle validity, solution checking, boundary cases, and reproducibility where randomness is involved. Use descriptive test names that state the expected behavior.

## Commit & Pull Request Guidelines

There is no commit history from which to infer existing conventions. Use concise, imperative commit subjects, such as `Add puzzle validation`. Keep commits focused on one coherent change.

Pull requests should explain the change, its purpose, and how it was verified. Link relevant issues and include screenshots for visual changes. Call out new dependencies, configuration requirements, and any checks that could not be run.

Never merge a pull request. Open it, wait for the checks, and report the result so the maintainer can review and merge.
