import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJitProvisioningConfigTable1741100000000 implements MigrationInterface {
  name = 'CreateJitProvisioningConfigTable1741100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE jit_provisioning_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        jit_enabled BOOLEAN NOT NULL DEFAULT true,
        default_role VARCHAR(20) NOT NULL DEFAULT 'developer',
        auto_update_profile BOOLEAN NOT NULL DEFAULT true,
        auto_update_roles BOOLEAN NOT NULL DEFAULT false,
        welcome_email BOOLEAN NOT NULL DEFAULT true,
        require_email_domains TEXT[] DEFAULT NULL,
        attribute_mapping JSONB NOT NULL DEFAULT '{"email": "email", "firstName": "firstName", "lastName": "lastName", "displayName": "displayName", "groups": "groups", "department": "department", "jobTitle": "jobTitle"}',
        group_role_mapping JSONB NOT NULL DEFAULT '{}',
        conflict_resolution VARCHAR(30) NOT NULL DEFAULT 'link_existing',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_jit_config_workspace ON jit_provisioning_configs (workspace_id);`);

    // Add sso_profile_data column to users table for storing IdP profile attributes
    await queryRunner.query(`ALTER TABLE users ADD COLUMN sso_profile_data JSONB DEFAULT NULL;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS sso_profile_data;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jit_config_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS jit_provisioning_configs;`);
  }
}
