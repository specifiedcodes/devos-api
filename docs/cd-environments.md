# CD Environment Configuration

This document describes the GitHub environment configuration required for the DevOS continuous deployment pipeline.

## GitHub Environments

### Staging Environment

- **Name:** `staging`
- **Required reviewers:** None (auto-deploy on merge to main)
- **Wait timer:** 0 (immediate deployment)
- **Branch policy:** Restrict to `main` branch only

**Environment Secrets:**

| Secret | Description | Required |
|--------|-------------|----------|
| `RAILWAY_TOKEN` | Railway deployment API token for staging | Yes |
| `SLACK_WEBHOOK_URL` | Slack notification webhook URL | No (notifications are conditional) |

**Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `STAGING_API_URL` | devos-api staging URL | `https://staging-api.devos.app` |
| `STAGING_FRONTEND_URL` | devos-frontend staging URL | `https://staging.devos.app` |
| `STAGING_WS_URL` | devos-websocket staging URL | `https://staging-ws.devos.app` |
| `STAGING_ORCHESTRATOR_URL` | devos-orchestrator staging URL (internal) | `https://staging-orchestrator.devos.app` |

### Production Environment

- **Name:** `production`
- **Required reviewers:** 2 (minimum, configured in GitHub UI)
- **Wait timer:** 0 (immediate after approval)
- **Branch policy:** Restrict to `main` branch only

**Environment Secrets:**

| Secret | Description | Required |
|--------|-------------|----------|
| `RAILWAY_TOKEN` | Railway deployment API token for production | Yes |
| `SLACK_WEBHOOK_URL` | Slack notification webhook URL | No (notifications are conditional) |

**Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `PRODUCTION_API_URL` | devos-api production URL | `https://api.devos.app` |
| `PRODUCTION_FRONTEND_URL` | devos-frontend production URL | `https://devos.app` |
| `PRODUCTION_WS_URL` | devos-websocket production URL | `https://ws.devos.app` |

## GitHub Repository Secrets (Shared)

| Secret | Description | Required |
|--------|-------------|----------|
| `SLACK_WEBHOOK_URL` | Slack notification webhook for deployment alerts | No (notification steps are conditional) |

**Note:** `GITHUB_TOKEN` is automatically available in GitHub Actions and provides write access to GitHub Container Registry (GHCR). No additional registry secrets are needed.

## Container Registry

All Docker images are pushed to **GitHub Container Registry (GHCR)** at `ghcr.io/<org>/<repo>`.

Authentication uses the automatic `GITHUB_TOKEN` with `packages: write` permission.

## Deployment Flow

1. **On merge to main:** Auto-deploy to staging
2. **Staging smoke tests:** Automated health checks and response validation
3. **Manual trigger:** `workflow_dispatch` to promote to production
4. **Production approval:** Requires 2 reviewers in the `production` GitHub environment
5. **Production deployment:** Same Docker image SHA as staging (promote, not rebuild)

## Image Promotion Pattern

Production deployments use the exact same Docker image SHA that passed staging smoke tests. This ensures what was tested is exactly what gets deployed. The workflow never rebuilds for production.

## Setting Up Environments

Environments are configured in the GitHub repository UI:

1. Go to **Settings > Environments**
2. Create `staging` environment (no protection rules)
3. Create `production` environment:
   - Add required reviewers (minimum 2)
   - Restrict to `main` branch
4. Add secrets and variables to each environment as listed above
