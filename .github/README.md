# GitHub Actions Workflows

This directory contains the GitHub Actions workflows for this repository.

## Workflows

### 1. `validate-pr.yml` (Validate Pull Request)
- **Trigger:** Automatically on `pull_request` events targeting `main` or `develop` branches (opened, synchronized, reopened, ready_for_review). Also manually via `workflow_dispatch`.
- **Purpose:** Runs a comprehensive suite of checks on every Pull Request to ensure code quality, correctness, and adherence to standards before merging.
- **Checks Performed:**
    - Linting (ESLint)
    - TypeScript type checking
    - Code formatting
    - Unit tests
    - Integration tests (fixture-based)
    - Package build and smoke tests
    - Security scan (pnpm audit)
    - Version change check (ensures `package.json` version is updated for stable releases, but allows unchanged for non-release PRs)
- **Outcome:** Provides a summary of all checks directly in the PR.

### 2. `release.yml` (Release to NPM)
- **Trigger:**
    - Automatically on `push` to `main` branch when `package.json` changes.
    - Manually via `workflow_dispatch` with specific version input.
- **Purpose:** Handles the official, stable release process for the package to NPM.
- **Actions:**
    - Performs quality checks, runs all tests, and builds the package.
    - Publishes the package to NPM using the `latest` tag.
    - Creates a corresponding GitHub Release with changelog.
    - Bumps the version in `package.json` and pushes a commit (if triggered automatically by `package.json` change). If triggered manually, it updates the version, commits, and pushes.
- **Use Case:** For official, stable versions that should be widely available via `npm install @opperai/agents`.

### 3. `beta-release.yml` (Beta/Nightly Release)
- **Trigger:** Manually via `workflow_dispatch`.
- **Purpose:** Allows for publishing pre-release (beta, nightly) versions of the package to NPM without affecting the `latest` tag or modifying the Git history on `main`.
- **Inputs:**
    - `manual_version` (Optional): Specify an exact version string (e.g., `0.3.0-beta`). If provided, this version is used directly.
    - `tag`: The NPM distribution tag to use (e.g., `beta`, `nightly`). Defaults to `beta`.
    - `bump_type` (Optional): Semver bump type (`patch`, `minor`, `major`, or `none`). Used if `manual_version` is not provided to determine the base version before adding a timestamp and commit hash.
- **Actions:**
    - Checks out the latest code from `main`.
    - **Locally** (within the GitHub Actions runner, not committed to the repository):
        - Determines the version to publish (either `manual_version` or an auto-generated timestamped pre-release version).
        - Builds the package.
    - Publishes the package to NPM under the specified `tag` (e.g., `npm publish --tag beta`).
    - **Does not commit** any version changes to the repository, nor does it create a GitHub Release.
- **Use Case:** For testing new features, bug fixes, or providing early access to upcoming versions without marking them as stable. Users must explicitly install with the tag (e.g., `npm install @opperai/agents@beta`).
