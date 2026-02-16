# CI Branch Protection Rules

This document describes the recommended branch protection rules for all DevOS repositories.

## Recommended GitHub Branch Protection Settings

These settings should be configured in each repository's GitHub Settings > Branches > Branch protection rules.

### Protected Branch: `main`

| Setting | Value |
|---------|-------|
| Require pull request before merging | Yes |
| Required approvals | 1 |
| Dismiss stale reviews on new pushes | Yes |
| Require status checks to pass | Yes |
| Required status checks | `lint-and-typecheck`, `test`, `build` |
| Require branches to be up to date | Yes |
| No direct pushes | Yes (restrict to PR merges only) |

### Protected Branch: `develop`

| Setting | Value |
|---------|-------|
| Require pull request before merging | Yes |
| Required approvals | 1 |
| Require status checks to pass | Yes |
| Required status checks | `lint-and-typecheck`, `test`, `build` |

## Required Status Checks

The following CI jobs must pass before a PR can be merged:

1. **lint-and-typecheck** - ESLint linting and TypeScript type checking
2. **test** - Unit and integration tests with coverage threshold (80% minimum)
3. **build** - Production build verification

The **security** job runs with `continue-on-error: true` and is informational only (does not block merges).

## CI Workflow Triggers

All workflows trigger on:
- `pull_request` targeting `main` or `develop` branches
- `push` to `main` branch

## Coverage Requirements

All repositories enforce a minimum 80% line coverage threshold via `scripts/ci-coverage-check.sh`. This can be configured per-repo by setting the `COVERAGE_THRESHOLD` environment variable.

## Applying These Rules

Branch protection rules are configured in GitHub repository settings, not in workflow files. To apply:

1. Go to repository Settings > Branches
2. Click "Add branch protection rule"
3. Enter branch name pattern (e.g., `main`)
4. Enable the settings listed above
5. Save changes

Repeat for each repository and each protected branch.
