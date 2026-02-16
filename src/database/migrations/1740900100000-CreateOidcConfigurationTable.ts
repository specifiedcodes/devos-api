import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOidcConfigurationTable1740900100000 implements MigrationInterface {
  name = 'CreateOidcConfigurationTable1740900100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oidc_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider_type VARCHAR(50) NOT NULL DEFAULT 'custom',
        display_name VARCHAR(255),
        client_id VARCHAR(500) NOT NULL,
        client_secret TEXT NOT NULL,
        client_secret_iv VARCHAR(200) NOT NULL,
        discovery_url TEXT NOT NULL,
        issuer TEXT,
        authorization_endpoint TEXT,
        token_endpoint TEXT,
        userinfo_endpoint TEXT,
        jwks_uri TEXT,
        end_session_endpoint TEXT,
        scopes TEXT[] NOT NULL DEFAULT ARRAY['openid', 'email', 'profile'],
        allowed_domains TEXT[],
        response_type VARCHAR(50) NOT NULL DEFAULT 'code',
        use_pkce BOOLEAN NOT NULL DEFAULT true,
        token_endpoint_auth_method VARCHAR(50) NOT NULL DEFAULT 'client_secret_post',
        attribute_mapping JSONB NOT NULL DEFAULT '{"email": "email", "firstName": "given_name", "lastName": "family_name", "groups": "groups"}',
        is_active BOOLEAN NOT NULL DEFAULT false,
        is_tested BOOLEAN NOT NULL DEFAULT false,
        last_login_at TIMESTAMP WITH TIME ZONE,
        login_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        discovery_last_fetched_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_oidc_config_workspace ON oidc_configurations (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_oidc_config_active ON oidc_configurations (is_active);`);
    await queryRunner.query(`CREATE INDEX idx_oidc_config_provider_type ON oidc_configurations (provider_type);`);

    // Add oidc_config_id column to sso_audit_events
    await queryRunner.query(`
      ALTER TABLE sso_audit_events ADD COLUMN oidc_config_id UUID REFERENCES oidc_configurations(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_oidc_config ON sso_audit_events (oidc_config_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_oidc_config;`);
    await queryRunner.query(`ALTER TABLE sso_audit_events DROP COLUMN IF EXISTS oidc_config_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_oidc_config_provider_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_oidc_config_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_oidc_config_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS oidc_configurations;`);
  }
}
