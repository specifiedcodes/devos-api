/**
 * Migration: CreateJiraIntegrationTables
 * Story 21.6: Jira Two-Way Sync (AC1)
 *
 * Creates jira_integrations and jira_sync_items tables with all
 * required columns, indexes, constraints, and defaults.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJiraIntegrationTables1708800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Jira integration configuration per workspace
    await queryRunner.query(`
      CREATE TABLE jira_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
        jira_site_url VARCHAR(500) NOT NULL,
        jira_project_key VARCHAR(20) NOT NULL,
        jira_project_name VARCHAR(255),
        cloud_id VARCHAR(100) NOT NULL,
        access_token TEXT NOT NULL,
        access_token_iv VARCHAR(100) NOT NULL,
        refresh_token TEXT NOT NULL,
        refresh_token_iv VARCHAR(100) NOT NULL,
        token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        status_mapping JSONB NOT NULL DEFAULT '{"backlog":"To Do","in_progress":"In Progress","review":"In Review","done":"Done"}',
        field_mapping JSONB NOT NULL DEFAULT '{"title":"summary","description":"description","storyPoints":"story_points","priority":"priority"}',
        issue_type VARCHAR(50) NOT NULL DEFAULT 'Story',
        sync_direction VARCHAR(20) NOT NULL DEFAULT 'bidirectional' CHECK (sync_direction IN ('devos_to_jira', 'jira_to_devos', 'bidirectional')),
        webhook_id VARCHAR(100),
        webhook_secret VARCHAR(255),
        webhook_secret_iv VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        connected_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        last_sync_at TIMESTAMP WITH TIME ZONE,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        error_count INTEGER DEFAULT 0,
        sync_count INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_jira_integration_workspace ON jira_integrations (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_jira_integration_cloud ON jira_integrations (cloud_id)`);
    await queryRunner.query(`CREATE INDEX idx_jira_integration_status ON jira_integrations (is_active)`);

    // Per-story sync tracking between DevOS stories and Jira issues
    await queryRunner.query(`
      CREATE TABLE jira_sync_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        jira_integration_id UUID NOT NULL REFERENCES jira_integrations(id) ON DELETE CASCADE,
        devos_story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        jira_issue_key VARCHAR(30) NOT NULL,
        jira_issue_id VARCHAR(100) NOT NULL,
        jira_issue_type VARCHAR(50) DEFAULT 'Story',
        last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_devos_update_at TIMESTAMP WITH TIME ZONE,
        last_jira_update_at TIMESTAMP WITH TIME ZONE,
        sync_status VARCHAR(20) NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'conflict', 'error')),
        sync_direction_last VARCHAR(20) CHECK (sync_direction_last IN ('devos_to_jira', 'jira_to_devos')),
        conflict_details JSONB,
        error_message TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_jira_sync_item_story ON jira_sync_items (jira_integration_id, devos_story_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_jira_sync_item_issue ON jira_sync_items (jira_integration_id, jira_issue_id)`);
    await queryRunner.query(`CREATE INDEX idx_jira_sync_item_key ON jira_sync_items (jira_issue_key)`);
    await queryRunner.query(`CREATE INDEX idx_jira_sync_item_status ON jira_sync_items (sync_status)`);
    await queryRunner.query(`CREATE INDEX idx_jira_sync_item_integration ON jira_sync_items (jira_integration_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_sync_item_integration`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_sync_item_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_sync_item_key`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_sync_item_issue`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_sync_item_story`);
    await queryRunner.query(`DROP TABLE IF EXISTS jira_sync_items`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_integration_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_integration_cloud`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jira_integration_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS jira_integrations`);
  }
}
