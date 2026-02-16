import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSamlConfigurationTables1740900000000 implements MigrationInterface {
  name = 'CreateSamlConfigurationTables1740900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE saml_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider_name VARCHAR(100) NOT NULL DEFAULT 'Custom',
        display_name VARCHAR(255),
        entity_id TEXT NOT NULL,
        sso_url TEXT NOT NULL,
        slo_url TEXT,
        certificate TEXT NOT NULL,
        certificate_iv VARCHAR(200) NOT NULL,
        certificate_fingerprint VARCHAR(128),
        certificate_expires_at TIMESTAMP WITH TIME ZONE,
        signing_certificate TEXT,
        signing_certificate_iv VARCHAR(200),
        attribute_mapping JSONB NOT NULL DEFAULT '{"email": "email", "firstName": "firstName", "lastName": "lastName", "groups": "groups"}',
        name_id_format VARCHAR(255) NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        authn_context VARCHAR(255) DEFAULT 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
        want_assertions_signed BOOLEAN NOT NULL DEFAULT true,
        want_response_signed BOOLEAN NOT NULL DEFAULT true,
        allow_unencrypted_assertion BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT false,
        is_tested BOOLEAN NOT NULL DEFAULT false,
        last_login_at TIMESTAMP WITH TIME ZONE,
        login_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        metadata_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_saml_config_workspace ON saml_configurations (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_saml_config_active ON saml_configurations (is_active);`);
    await queryRunner.query(`CREATE INDEX idx_saml_config_entity ON saml_configurations (entity_id);`);

    await queryRunner.query(`
      CREATE TABLE sso_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        event_type VARCHAR(60) NOT NULL,
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        saml_config_id UUID REFERENCES saml_configurations(id) ON DELETE SET NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_sso_audit_workspace ON sso_audit_events (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_event_type ON sso_audit_events (event_type);`);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_actor ON sso_audit_events (actor_id);`);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_created ON sso_audit_events (created_at);`);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_saml_config ON sso_audit_events (saml_config_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_saml_config;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_created;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_actor;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_event_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_audit_events;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_saml_config_entity;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_saml_config_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_saml_config_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS saml_configurations;`);
  }
}
