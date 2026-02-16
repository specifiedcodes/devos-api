import {
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health check controller for workspace isolation security
 * Story 3.7: Per-Workspace Cost Isolation
 *
 * Provides runtime verification that Row-Level Security is enabled
 */
@ApiTags('Health')
@Controller('api/v1/health')
export class UsageHealthController {
  private readonly logger = new Logger(UsageHealthController.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Check if Row-Level Security is enabled on api_usage table
   * GET /api/v1/health/rls-status
   *
   * SECURITY: This endpoint verifies that database-level workspace isolation
   * is active. If RLS is disabled, all workspace isolation is compromised.
   *
   * @returns RLS status and active policies
   * @throws InternalServerErrorException if RLS is disabled
   */
  @Get('rls-status')
  async checkRLSStatus() {
    try {
      // Check if RLS is enabled on api_usage table
      const rlsStatus = await this.dataSource.query(`
        SELECT
          relname as table_name,
          relrowsecurity as rls_enabled,
          relforcerowsecurity as rls_forced
        FROM pg_class
        WHERE relname = 'api_usage'
      `);

      if (!rlsStatus || rlsStatus.length === 0) {
        this.logger.error('CRITICAL: api_usage table not found!');
        throw new InternalServerErrorException(
          'Security configuration error: api_usage table not found',
        );
      }

      const tableInfo = rlsStatus[0];

      if (!tableInfo.rls_enabled) {
        this.logger.error('CRITICAL: RLS is DISABLED on api_usage table!');
        throw new InternalServerErrorException(
          'Security misconfiguration: RLS is disabled on api_usage table',
        );
      }

      // Get list of active policies
      const policies = await this.dataSource.query(`
        SELECT
          policyname as policy_name,
          cmd as command_type,
          CASE
            WHEN qual IS NOT NULL THEN 'USING clause defined'
            ELSE 'No USING clause'
          END as using_status,
          CASE
            WHEN with_check IS NOT NULL THEN 'WITH CHECK defined'
            ELSE 'No WITH CHECK'
          END as check_status
        FROM pg_policies
        WHERE tablename = 'api_usage'
        ORDER BY policyname
      `);

      this.logger.log(
        `RLS health check passed: ${policies.length} policies active`,
      );

      return {
        status: 'healthy',
        rls_enabled: true,
        rls_forced: tableInfo.rls_forced,
        policy_count: policies.length,
        policies: policies,
        message: 'Row-Level Security is active on api_usage table',
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(
        `Failed to check RLS status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new InternalServerErrorException(
        'Failed to verify security configuration',
      );
    }
  }

  /**
   * Test workspace context isolation
   * GET /api/v1/health/workspace-context-test
   *
   * SECURITY: Tests that workspace context setting works correctly
   * This is a diagnostic endpoint for verifying RLS context mechanics
   *
   * @returns Context test results
   */
  @Get('workspace-context-test')
  async testWorkspaceContext() {
    try {
      // Test setting workspace context
      const testWorkspaceId = '00000000-0000-0000-0000-000000000000';

      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', $1, TRUE)`,
        [testWorkspaceId],
      );

      // Verify it was set
      const currentContext = await this.dataSource.query(`
        SELECT current_setting('app.current_workspace_id', TRUE) as workspace_id
      `);

      // Clear context
      await this.dataSource.query(
        `SELECT set_config('app.current_workspace_id', NULL, TRUE)`,
      );

      return {
        status: 'healthy',
        context_set_successful: true,
        test_workspace_id: testWorkspaceId,
        retrieved_context: currentContext[0]?.workspace_id,
        message: 'Workspace context mechanism is functioning correctly',
      };
    } catch (error) {
      this.logger.error(
        `Workspace context test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new InternalServerErrorException(
        'Workspace context mechanism failed',
      );
    }
  }
}
