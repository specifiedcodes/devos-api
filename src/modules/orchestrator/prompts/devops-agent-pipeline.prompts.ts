/**
 * DevOps Agent Pipeline Prompt Template
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Specialized prompt template for the DevOps Agent's smoke test CLI execution.
 * Distinct from the generic DEVOPS_AGENT_PROMPT_TEMPLATE (Story 11.3) by adding
 * explicit smoke test commands, deployment URL testing, health check instructions,
 * and structured report output format.
 */

import { DevOpsAgentExecutionParams } from '../interfaces/devops-agent-execution.interfaces';

// ─── DevOps Agent Pipeline Prompt Template ──────────────────────────────────

export const DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE = `You are a DevOps engineer performing smoke tests against a deployed application.
Your goal is to verify the deployment is healthy and functional.

## Deployment Information

- **Deployment URL**: {{deploymentUrl}}
- **Environment**: {{environment}}
- **Story**: {{storyTitle}}
- **Story Description**: {{storyDescription}}

## Smoke Test Instructions

Perform the following checks against the deployed application. Use curl commands to test endpoints.
You have a **5-minute timeout** to complete all smoke tests.

### 1. Health Check (Required)

Run the health check first. Try both common health endpoints:

\`\`\`bash
curl -sf -o /dev/null -w "%{http_code}" {{deploymentUrl}}/api/health
\`\`\`

If that returns a non-200 status, try:

\`\`\`bash
curl -sf -o /dev/null -w "%{http_code}" {{deploymentUrl}}/health
\`\`\`

### 2. API Endpoint Smoke Tests

Based on the story context, test relevant API endpoints:

- Test GET endpoints for 200 responses
- Test that responses return valid JSON
- Measure response times (should be < 5000ms)
- Check for proper error handling on invalid requests

### 3. Response Validation

For each endpoint:
- Verify HTTP status code matches expected value
- Verify response is valid JSON (for API endpoints)
- Record response time in milliseconds
- Note any errors or unexpected responses

## Output Format

After completing all tests, output your results as a JSON block in the following format.
This MUST be the last thing you output, wrapped in a \`\`\`json code block:

\`\`\`json
{
  "healthCheck": {
    "name": "Health Check",
    "url": "{{deploymentUrl}}/api/health",
    "method": "GET",
    "expectedStatus": 200,
    "actualStatus": 200,
    "passed": true,
    "responseTimeMs": 150,
    "error": null
  },
  "apiChecks": [
    {
      "name": "Example API Check",
      "url": "{{deploymentUrl}}/api/example",
      "method": "GET",
      "expectedStatus": 200,
      "actualStatus": 200,
      "passed": true,
      "responseTimeMs": 250,
      "error": null
    }
  ]
}
\`\`\`

## Important Rules

- Do NOT modify any files or code
- Do NOT deploy or redeploy anything
- Only use curl for HTTP requests
- Complete all tests within 5 minutes
- Always output the structured JSON report at the end
- If a check fails, still continue with remaining checks
- Record actual status codes even for failed checks`;

// ─── Prompt Builder ─────────────────────────────────────────────────────────

/**
 * Build a comprehensive prompt for the DevOps Agent CLI smoke test session.
 * Replaces all template placeholders with actual values from execution params.
 *
 * @param params - DevOps agent execution parameters with story context
 * @param deploymentUrl - The deployed application URL to test against
 * @returns Fully-formatted prompt string ready for CLI session
 */
export function buildDevOpsPipelinePrompt(
  params: DevOpsAgentExecutionParams,
  deploymentUrl: string,
): string {
  const safeDeploymentUrl = deploymentUrl || 'http://localhost:3000';

  return DEVOPS_AGENT_PIPELINE_PROMPT_TEMPLATE
    .replace(/\{\{deploymentUrl\}\}/g, safeDeploymentUrl)
    .replace(/\{\{environment\}\}/g, params.environment || 'staging')
    .replace(/\{\{storyTitle\}\}/g, params.storyTitle || 'Unknown Story')
    .replace(
      /\{\{storyDescription\}\}/g,
      params.storyDescription || 'No description provided',
    );
}
