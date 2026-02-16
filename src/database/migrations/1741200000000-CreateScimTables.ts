import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScimTables1741200000000 implements MigrationInterface {
  name = 'CreateScimTables1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SCIM workspace configuration
    await queryRunner.query(`
      CREATE TABLE scim_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false,
        base_url VARCHAR(512) NOT NULL DEFAULT '',
        default_role VARCHAR(20) NOT NULL DEFAULT 'developer',
        sync_groups BOOLEAN NOT NULL DEFAULT true,
        auto_deactivate BOOLEAN NOT NULL DEFAULT true,
        auto_reactivate BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_scim_config_workspace ON scim_configurations (workspace_id)`);

    // SCIM bearer tokens (hashed, one or more per workspace)
    await queryRunner.query(`
      CREATE TABLE scim_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL,
        token_prefix VARCHAR(12) NOT NULL,
        label VARCHAR(100) NOT NULL DEFAULT 'Default SCIM Token',
        is_active BOOLEAN NOT NULL DEFAULT true,
        last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_scim_tokens_workspace ON scim_tokens (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_scim_tokens_hash ON scim_tokens (token_hash)`);

    // SCIM groups (mapped to workspace roles/teams)
    await queryRunner.query(`
      CREATE TABLE scim_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        external_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        mapped_role VARCHAR(20) DEFAULT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_scim_groups_workspace_external ON scim_groups (workspace_id, external_id)`);
    await queryRunner.query(`CREATE INDEX idx_scim_groups_workspace ON scim_groups (workspace_id)`);

    // SCIM group memberships (link users to SCIM groups)
    await queryRunner.query(`
      CREATE TABLE scim_group_memberships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES scim_groups(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_scim_membership_group_user ON scim_group_memberships (group_id, user_id)`);
    await queryRunner.query(`CREATE INDEX idx_scim_membership_user ON scim_group_memberships (user_id)`);

    // SCIM sync log for auditing all SCIM operations
    await queryRunner.query(`
      CREATE TABLE scim_sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        operation VARCHAR(30) NOT NULL,
        resource_type VARCHAR(20) NOT NULL,
        resource_id VARCHAR(255) DEFAULT NULL,
        external_id VARCHAR(255) DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'success',
        error_message TEXT DEFAULT NULL,
        request_body JSONB DEFAULT NULL,
        response_body JSONB DEFAULT NULL,
        ip_address VARCHAR(45) DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_scim_sync_logs_workspace ON scim_sync_logs (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_scim_sync_logs_created ON scim_sync_logs (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_scim_sync_logs_resource ON scim_sync_logs (resource_type, resource_id)`);

    // Add SCIM external_id to users table for linking
    await queryRunner.query(`ALTER TABLE users ADD COLUMN scim_external_id VARCHAR(255) DEFAULT NULL`);
    await queryRunner.query(`CREATE INDEX idx_users_scim_external ON users (scim_external_id) WHERE scim_external_id IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_scim_external`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS scim_external_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS scim_sync_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS scim_group_memberships`);
    await queryRunner.query(`DROP TABLE IF EXISTS scim_groups`);
    await queryRunner.query(`DROP TABLE IF EXISTS scim_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS scim_configurations`);
  }
}
