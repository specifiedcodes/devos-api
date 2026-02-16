import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSsoFederatedSessionsTable1741300000000 implements MigrationInterface {
  name = 'CreateSsoFederatedSessionsTable1741300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sso_federated_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider_type VARCHAR(10) NOT NULL CHECK (provider_type IN ('saml', 'oidc')),
        provider_config_id UUID NOT NULL,
        idp_session_id VARCHAR(512),
        devos_session_id VARCHAR(255) NOT NULL,
        access_token_jti VARCHAR(255),
        refresh_token_jti VARCHAR(255),
        session_timeout_minutes INTEGER NOT NULL DEFAULT 480,
        idle_timeout_minutes INTEGER NOT NULL DEFAULT 30,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        terminated_at TIMESTAMP WITH TIME ZONE,
        termination_reason VARCHAR(30) CHECK (termination_reason IN ('logout', 'timeout', 'idle_timeout', 'forced', 'idp_logout', 'token_refresh_failed', 'scim_deactivated'))
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_user ON sso_federated_sessions (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_workspace ON sso_federated_sessions (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_user_workspace ON sso_federated_sessions (user_id, workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_idp ON sso_federated_sessions (idp_session_id) WHERE idp_session_id IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_devos ON sso_federated_sessions (devos_session_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_active ON sso_federated_sessions (user_id, workspace_id) WHERE terminated_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_expires ON sso_federated_sessions (expires_at) WHERE terminated_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_sso_fed_session_provider ON sso_federated_sessions (provider_type, provider_config_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_provider`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_expires`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_devos`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_idp`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_user_workspace`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_workspace`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_fed_session_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_federated_sessions`);
  }
}
