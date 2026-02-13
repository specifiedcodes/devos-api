/**
 * DevOps Agent Prompt Templates
 * Story 5.6: DevOps Agent Implementation
 *
 * Structured prompts for each DevOps agent task type.
 * All prompts instruct Claude to return JSON-structured responses.
 */

import { DevOpsAgentTask } from '../interfaces/devops-agent.interfaces';

/**
 * Shared system prompt for all DevOps Agent task types
 */
export const DEVOPS_AGENT_SYSTEM_PROMPT = `You are a DevOps Agent - an autonomous AI infrastructure and deployment engineer.
You manage deployments, infrastructure provisioning, health monitoring, and incident response for software projects.

Your capabilities:
- Plan and execute deployments across environments (staging, production)
- Configure infrastructure resources with scaling policies and security
- Monitor system health, identify performance issues, and recommend optimizations
- Perform safe rollbacks with incident analysis and prevention measures

Rules:
- Always prioritize zero-downtime deployments
- Validate deployment health with smoke tests before marking complete
- Include rollback plans for every deployment
- Monitor critical metrics: uptime, response time, error rate, resource usage
- Flag security misconfigurations in infrastructure setup
- Generate incident reports with root cause analysis for rollbacks
- Return your response as valid JSON matching the required schema
- Do NOT include markdown code fences or any text outside the JSON object`;

/**
 * Build user prompt for deploy task
 */
export function buildDeployPrompt(task: DevOpsAgentTask): string {
  const servicesSection = task.services?.length
    ? `\nServices to deploy:\n${task.services.map((s) => `- ${s}`).join('\n')}`
    : '';

  const configSection = task.config
    ? `\nDeployment configuration:\n${JSON.stringify(task.config, null, 2)}`
    : '';

  const sections = [
    `Environment: ${task.environment || 'N/A'}`,
    `Project ID: ${task.projectId || 'N/A'}`,
    `Description: ${task.description || 'No description provided'}`,
    servicesSection,
    configSection,
  ].filter(Boolean).join('\n');

  return `Plan and execute a deployment based on the following context. Analyze the environment, services, and configuration to produce a detailed deployment plan with execution steps. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "environment": "staging|production",
  "deploymentId": "unique-deployment-id",
  "steps": [
    {
      "name": "Step name",
      "status": "success|failed|skipped",
      "duration": "2s",
      "output": "Step output details"
    }
  ],
  "deploymentUrl": "https://deployed-url.example.com",
  "smokeTestsPassed": true,
  "rollbackAvailable": true,
  "summary": "Human-readable summary of the deployment"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for setup-infrastructure task
 */
export function buildSetupInfrastructurePrompt(task: DevOpsAgentTask): string {
  const servicesSection = task.services?.length
    ? `\nServices requiring infrastructure:\n${task.services.map((s) => `- ${s}`).join('\n')}`
    : '';

  const configSection = task.config
    ? `\nInfrastructure requirements:\n${JSON.stringify(task.config, null, 2)}`
    : '';

  const sections = [
    `Environment: ${task.environment || 'N/A'}`,
    `Project ID: ${task.projectId || 'N/A'}`,
    `Description: ${task.description || 'No description provided'}`,
    servicesSection,
    configSection,
  ].filter(Boolean).join('\n');

  return `Analyze infrastructure requirements and generate a configuration plan. Consider resource requirements, scaling policies, networking, and security groups. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "description": "Infrastructure configuration description",
  "resources": [
    {
      "type": "Resource type (e.g., compute, database, cache)",
      "name": "Resource name",
      "configuration": { "key": "value" },
      "estimatedCost": "$X/month"
    }
  ],
  "networkConfig": {
    "vpc": "VPC identifier",
    "subnets": ["subnet-1", "subnet-2"],
    "securityGroups": ["sg-1", "sg-2"]
  },
  "scalingPolicy": {
    "minInstances": 1,
    "maxInstances": 4,
    "targetCpuUtilization": 70
  },
  "recommendations": ["list of infrastructure recommendations"],
  "summary": "Human-readable summary of infrastructure setup"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for monitor-health task
 */
export function buildMonitorHealthPrompt(task: DevOpsAgentTask): string {
  const servicesSection = task.services?.length
    ? `\nServices to monitor:\n${task.services.map((s) => `- ${s}`).join('\n')}`
    : '';

  const configSection = task.config
    ? `\nMonitoring configuration:\n${JSON.stringify(task.config, null, 2)}`
    : '';

  const sections = [
    `Deployment URL: ${task.deploymentUrl || 'N/A'}`,
    `Environment: ${task.environment || 'N/A'}`,
    `Description: ${task.description || 'No description provided'}`,
    servicesSection,
    configSection,
  ].filter(Boolean).join('\n');

  return `Analyze the health of the deployed system. Check uptime, response times, error rates, and resource usage for all services. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "description": "Health check description",
  "overallHealth": "healthy|degraded|unhealthy",
  "services": [
    {
      "name": "Service name",
      "status": "healthy|degraded|unhealthy",
      "responseTime": "50ms",
      "errorRate": 0.01,
      "details": "Service health details"
    }
  ],
  "metrics": {
    "uptime": "99.9%",
    "avgResponseTime": "120ms",
    "errorRate": 0.02,
    "cpuUsage": 45,
    "memoryUsage": 60
  },
  "alerts": [
    {
      "severity": "critical|warning|info",
      "message": "Alert message",
      "recommendation": "Recommended action"
    }
  ],
  "summary": "Human-readable summary of health monitoring"
}

Return ONLY the JSON object, no markdown or additional text.`;
}

/**
 * Build user prompt for rollback task
 */
export function buildRollbackPrompt(task: DevOpsAgentTask): string {
  const configSection = task.config
    ? `\nRollback context:\n${JSON.stringify(task.config, null, 2)}`
    : '';

  const sections = [
    `Environment: ${task.environment || 'N/A'}`,
    `Previous Deployment ID: ${task.previousDeploymentId || 'N/A'}`,
    `Description: ${task.description || 'No description provided'}`,
    configSection,
  ].filter(Boolean).join('\n');

  return `Analyze the failed deployment and generate a rollback strategy. Include incident analysis, rollback steps, verification, and prevention measures. Return the result as a JSON object.

<user_input>
${sections}
</user_input>

Return a JSON object with this exact schema:
{
  "environment": "staging|production",
  "previousDeploymentId": "deployment-id-to-rollback-to",
  "rollbackSteps": [
    {
      "name": "Step name",
      "status": "success|failed|skipped",
      "duration": "2s",
      "output": "Step output details"
    }
  ],
  "verificationPassed": true,
  "incidentReport": {
    "cause": "Root cause of the deployment failure",
    "impact": "Impact analysis",
    "resolution": "How the issue was resolved",
    "preventionMeasures": ["list of measures to prevent recurrence"]
  },
  "summary": "Human-readable summary of the rollback"
}

Return ONLY the JSON object, no markdown or additional text.`;
}
