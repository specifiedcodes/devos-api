import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSsoDomainsTable1741000000000 implements MigrationInterface {
  name = 'CreateSsoDomainsTable1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sso_domains (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        domain VARCHAR(255) NOT NULL,
        verification_method VARCHAR(20) NOT NULL DEFAULT 'dns',
        verification_token VARCHAR(128) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        verified_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        last_check_at TIMESTAMP WITH TIME ZONE,
        last_check_error TEXT,
        check_count INTEGER NOT NULL DEFAULT 0,
        saml_config_id UUID REFERENCES saml_configurations(id) ON DELETE SET NULL,
        oidc_config_id UUID REFERENCES oidc_configurations(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_sso_domains_domain ON sso_domains (domain);`);
    await queryRunner.query(`CREATE INDEX idx_sso_domains_workspace ON sso_domains (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_sso_domains_status ON sso_domains (status);`);
    await queryRunner.query(`CREATE INDEX idx_sso_domains_expires ON sso_domains (expires_at) WHERE status = 'pending';`);

    // Add domain_id column to sso_audit_events for domain-specific audit tracking
    await queryRunner.query(`ALTER TABLE sso_audit_events ADD COLUMN domain_id UUID REFERENCES sso_domains(id) ON DELETE SET NULL;`);
    await queryRunner.query(`CREATE INDEX idx_sso_audit_domain ON sso_audit_events (domain_id);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_audit_domain;`);
    await queryRunner.query(`ALTER TABLE sso_audit_events DROP COLUMN IF EXISTS domain_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_domains_expires;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_domains_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_domains_workspace;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_domains_domain;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_domains;`);
  }
}
