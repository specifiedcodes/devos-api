/**
 * DevOps Agent Interfaces
 * Story 5.6: DevOps Agent Implementation
 *
 * TypeScript interfaces for DevOps agent task inputs and result types.
 */

import { TokenUsage } from './claude-api.interfaces';

/**
 * Input task for the DevOps Agent.
 * Each task type maps to a specific DevOps operation.
 */
export interface DevOpsAgentTask {
  type: 'deploy' | 'setup-infrastructure' | 'monitor-health' | 'rollback';
  environment?: string;
  projectId?: string;
  description: string;
  deploymentUrl?: string;
  services?: string[];
  config?: Record<string, any>;
  previousDeploymentId?: string;
}

/**
 * Result for deploy task type
 */
export interface DeployResult {
  status: 'deployment_completed';
  environment: string;
  deploymentId: string;
  steps: Array<{
    name: string;
    status: 'success' | 'failed' | 'skipped';
    duration: string;
    output: string;
  }>;
  deploymentUrl: string;
  smokeTestsPassed: boolean;
  rollbackAvailable: boolean;
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for setup-infrastructure task type
 */
export interface SetupInfrastructureResult {
  status: 'infrastructure_configured';
  description: string;
  resources: Array<{
    type: string;
    name: string;
    configuration: Record<string, any>;
    estimatedCost: string;
  }>;
  networkConfig: {
    vpc: string;
    subnets: string[];
    securityGroups: string[];
  };
  scalingPolicy: {
    minInstances: number;
    maxInstances: number;
    targetCpuUtilization: number;
  };
  recommendations: string[];
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for monitor-health task type
 */
export interface MonitorHealthResult {
  status: 'health_checked';
  description: string;
  overallHealth: 'healthy' | 'degraded' | 'unhealthy';
  services: Array<{
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime: string;
    errorRate: number;
    details: string;
  }>;
  metrics: {
    uptime: string;
    avgResponseTime: string;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  alerts: Array<{
    severity: 'critical' | 'warning' | 'info';
    message: string;
    recommendation: string;
  }>;
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Result for rollback task type
 */
export interface RollbackResult {
  status: 'rollback_completed';
  environment: string;
  previousDeploymentId: string;
  rollbackSteps: Array<{
    name: string;
    status: 'success' | 'failed' | 'skipped';
    duration: string;
    output: string;
  }>;
  verificationPassed: boolean;
  incidentReport: {
    cause: string;
    impact: string;
    resolution: string;
    preventionMeasures: string[];
  };
  summary: string;
  tokensUsed: TokenUsage;
}

/**
 * Union type of all DevOps agent result types
 */
export type DevOpsAgentResult =
  | DeployResult
  | SetupInfrastructureResult
  | MonitorHealthResult
  | RollbackResult;
