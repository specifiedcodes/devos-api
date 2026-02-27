import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create integration_health_checks table
 * Story 21-9: Integration Health Monitoring (AC1)
 *
 * Single table storing current health state per workspace+integration_type.
 * No FK constraints to avoid cross-entity coupling; cleanup via application logic.
 */
export class CreateIntegrationHealthChecksTable1770000000100 implements MigrationInterface {
  name = 'CreateIntegrationHealthChecksTable1770000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE integration_health_checks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        integration_type VARCHAR(20) NOT NULL,
        integration_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'healthy',
        last_success_at TIMESTAMP WITH TIME ZONE,
        last_error_at TIMESTAMP WITH TIME ZONE,
        last_error_message TEXT,
        error_count_24h INTEGER DEFAULT 0,
        uptime_30d DECIMAL(5,2) DEFAULT 100,
        response_time_ms INTEGER,
        consecutive_failures INTEGER DEFAULT 0,
        health_details JSONB DEFAULT '{}',
        checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Unique composite index: one health record per workspace + integration type
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_integration_health_checks_workspace_type
      ON integration_health_checks (workspace_id, integration_type);
    `);

    // Index for querying by workspace and status
    await queryRunner.query(`
      CREATE INDEX idx_integration_health_checks_workspace_status
      ON integration_health_checks (workspace_id, status);
    `);

    // Index for querying/pruning by checked_at
    await queryRunner.query(`
      CREATE INDEX idx_integration_health_checks_checked_at
      ON integration_health_checks (checked_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_integration_health_checks_checked_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_integration_health_checks_workspace_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_integration_health_checks_workspace_type;`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration_health_checks;`);
  }
}
