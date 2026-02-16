import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSsoEnforcementPoliciesTable1741400000000 implements MigrationInterface {
  name = 'CreateSsoEnforcementPoliciesTable1741400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sso_enforcement_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        enforced BOOLEAN NOT NULL DEFAULT false,
        grace_period_hours INTEGER NOT NULL DEFAULT 72,
        grace_period_start TIMESTAMP WITH TIME ZONE,
        grace_period_end TIMESTAMP WITH TIME ZONE,
        bypass_emails TEXT[] NOT NULL DEFAULT '{}',
        bypass_service_accounts BOOLEAN NOT NULL DEFAULT true,
        owner_bypass_enabled BOOLEAN NOT NULL DEFAULT true,
        password_login_blocked BOOLEAN NOT NULL DEFAULT false,
        registration_blocked BOOLEAN NOT NULL DEFAULT false,
        enforcement_message VARCHAR(500) DEFAULT 'Your organization requires SSO login. Please use your corporate identity provider.',
        enforced_at TIMESTAMP WITH TIME ZONE,
        enforced_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_sso_enforcement_workspace ON sso_enforcement_policies (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_enforcement_active ON sso_enforcement_policies (workspace_id) WHERE enforced = true`);
    await queryRunner.query(`CREATE INDEX idx_sso_enforcement_grace ON sso_enforcement_policies (grace_period_end) WHERE grace_period_end IS NOT NULL AND enforced = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_enforcement_grace`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_enforcement_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_enforcement_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_enforcement_policies`);
  }
}
