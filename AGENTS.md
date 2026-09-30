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

Use a pull request for anything with a product or design decision in it — a new feature, a change in behaviour, a puzzle published for a date, anything where a maintainer might reasonably have wanted a say. Open it, wait for the checks, report the result, and let the maintainer review and merge it. Never merge such a pull request yourself.

Commit straight to `main` for small, low-risk changes where the only reasonable outcome is the one being implemented: documentation, CI configuration, dependency bumps, a one-line fix. Verify locally first, keep the commit to that single thing, and say plainly what was pushed. When it is not obvious which kind of change something is, treat it as the kind that needs review.

The reasoning is that a maintainer's attention is the scarce resource. A second pair of eyes earns its cost on a decision, and does not on a typo; sending everything through a pull request trains the reviewer to skim.
