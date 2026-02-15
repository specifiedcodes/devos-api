/**
 * DevOpsRollbackHandlerService
 * Story 11.7: DevOps Agent CLI Integration
 *
 * Triggers rollback to previous deployment when deployment or smoke tests fail.
 * Creates structured incident reports for audit trail.
 * Uses DeploymentRollbackService (Story 6.10).
 */
import { Injectable, Logger } from '@nestjs/common';
import { DeploymentRollbackService } from '../../integrations/deployment-rollback/deployment-rollback.service';
import {
  DevOpsRollbackResult,
  DevOpsIncidentReport,
  DevOpsSmokeTestResults,
  DevOpsDeploymentStatus,
} from '../interfaces/devops-agent-execution.interfaces';

@Injectable()
export class DevOpsRollbackHandlerService {
  private readonly logger = new Logger(DevOpsRollbackHandlerService.name);

  constructor(
    private readonly rollbackService: DeploymentRollbackService,
  ) {}

  /**
   * Trigger rollback to previous deployment.
   * Uses DeploymentRollbackService.initiateAutoRollback() from Story 6.10.
   */
  async performRollback(params: {
    platform: 'railway' | 'vercel';
    deploymentId: string;
    workspaceId: string;
    projectId: string;
    reason: string;
  }): Promise<DevOpsRollbackResult> {
    this.logger.log(
      `Performing rollback for ${params.platform} deployment ${params.deploymentId}: ${params.reason}`,
    );

    try {
      const rollbackResponse = await this.rollbackService.initiateAutoRollback(
        params.workspaceId,
        params.projectId,
        'system', // userId for automatic rollbacks
        {
          platform: params.platform,
          deploymentId: params.deploymentId,
          environment: 'production',
          reason: params.reason,
        },
      );

      this.logger.log(
        `Rollback initiated: ${rollbackResponse.id}`,
      );

      return {
        success: rollbackResponse.status === 'completed' || rollbackResponse.status === 'in_progress',
        previousDeploymentId: rollbackResponse.targetDeploymentId || null,
        rollbackUrl: null,
        error: null,
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown rollback error';
      this.logger.error(`Rollback failed: ${errorMessage}`);

      return {
        success: false,
        previousDeploymentId: null,
        rollbackUrl: null,
        error: errorMessage,
      };
    }
  }

  /**
   * Create an incident report for the failed deployment.
   */
  createIncidentReport(params: {
    storyId: string;
    deploymentId: string;
    deploymentUrl: string | null;
    failureReason: string;
    smokeTestResults: DevOpsSmokeTestResults | null;
    deploymentStatus: DevOpsDeploymentStatus | null;
    rollbackResult: DevOpsRollbackResult | null;
  }): DevOpsIncidentReport {
    // Determine severity
    const rollbackPerformed = params.rollbackResult !== null;
    const rollbackSuccessful = params.rollbackResult?.success ?? false;

    let severity: 'critical' | 'high' | 'medium';
    if (rollbackPerformed && !rollbackSuccessful) {
      severity = 'critical';
    } else if (
      params.deploymentStatus?.status === 'failed' ||
      params.deploymentStatus?.status === 'timeout'
    ) {
      severity = 'high';
    } else {
      severity = 'medium';
    }

    // Determine failure type
    let failureType: 'deployment_failed' | 'smoke_tests_failed' | 'timeout';
    if (params.deploymentStatus?.status === 'timeout') {
      failureType = 'timeout';
    } else if (params.smokeTestResults && !params.smokeTestResults.passed) {
      failureType = 'smoke_tests_failed';
    } else {
      failureType = 'deployment_failed';
    }

    // Build root cause
    let rootCause: string;
    if (params.deploymentStatus?.error) {
      rootCause = params.deploymentStatus.error;
    } else if (params.smokeTestResults && !params.smokeTestResults.passed) {
      const failedChecks = [
        ...(params.smokeTestResults.healthCheck.passed ? [] : ['Health check failed']),
        ...params.smokeTestResults.apiChecks
          .filter((c) => !c.passed)
          .map((c) => `${c.name}: ${c.error || 'failed'}`),
      ];
      rootCause = failedChecks.join('; ') || 'Smoke tests failed';
    } else {
      rootCause = params.failureReason;
    }

    // Build resolution
    const resolution = rollbackPerformed
      ? rollbackSuccessful
        ? 'Automatic rollback to previous deployment completed successfully'
        : 'Automatic rollback attempted but failed - manual intervention required'
      : 'No rollback performed';

    // Build recommendations
    const recommendations: string[] = [];

    if (failureType === 'deployment_failed') {
      recommendations.push('Review build logs for compilation errors');
      recommendations.push('Check deployment configuration and environment variables');
      recommendations.push('Verify dependency versions are compatible');
    }

    if (failureType === 'smoke_tests_failed') {
      recommendations.push('Review smoke test failures and fix failing endpoints');
      recommendations.push('Ensure database migrations completed successfully');
      recommendations.push('Check API endpoint responses match expected format');
    }

    if (failureType === 'timeout') {
      recommendations.push('Check deployment platform status for outages');
      recommendations.push('Review application startup time and health check endpoint');
      recommendations.push('Consider increasing deployment timeout if application needs more time');
    }

    if (!rollbackSuccessful && rollbackPerformed) {
      recommendations.push('Manually verify production deployment state');
      recommendations.push('Consider manual rollback via deployment platform dashboard');
    }

    return {
      storyId: params.storyId,
      timestamp: new Date(),
      severity,
      failureType,
      description: `Deployment failed for story ${params.storyId}: ${params.failureReason}`,
      deploymentId: params.deploymentId,
      rollbackPerformed,
      rollbackSuccessful,
      rootCause,
      resolution,
      recommendations,
    };
  }
}
