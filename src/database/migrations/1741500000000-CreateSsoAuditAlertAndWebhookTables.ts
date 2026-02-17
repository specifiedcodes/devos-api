import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSsoAuditAlertAndWebhookTables1741500000000 implements MigrationInterface {
  name = 'CreateSsoAuditAlertAndWebhookTables1741500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Alert rules for SSO security events
    await queryRunner.query(`
      CREATE TABLE sso_audit_alert_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        description VARCHAR(500),
        event_types TEXT[] NOT NULL DEFAULT '{}',
        threshold INTEGER NOT NULL DEFAULT 1,
        window_minutes INTEGER NOT NULL DEFAULT 5,
        notification_channels JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT true,
        cooldown_minutes INTEGER NOT NULL DEFAULT 30,
        last_triggered_at TIMESTAMP WITH TIME ZONE,
        trigger_count INTEGER NOT NULL DEFAULT 0,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_sso_alert_rules_workspace ON sso_audit_alert_rules (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_alert_rules_active ON sso_audit_alert_rules (workspace_id) WHERE is_active = true`);

    // Webhook configurations for SIEM integration
    await queryRunner.query(`
      CREATE TABLE sso_audit_webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        url VARCHAR(2000) NOT NULL,
        secret VARCHAR(500),
        event_types TEXT[] NOT NULL DEFAULT '{}',
        headers JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT true,
        retry_count INTEGER NOT NULL DEFAULT 3,
        timeout_ms INTEGER NOT NULL DEFAULT 10000,
        last_delivery_at TIMESTAMP WITH TIME ZONE,
        last_delivery_status VARCHAR(20),
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        max_consecutive_failures INTEGER NOT NULL DEFAULT 10,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_sso_webhooks_workspace ON sso_audit_webhooks (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_webhooks_active ON sso_audit_webhooks (workspace_id) WHERE is_active = true`);

    // Webhook delivery log for debugging
    await queryRunner.query(`
      CREATE TABLE sso_audit_webhook_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID NOT NULL REFERENCES sso_audit_webhooks(id) ON DELETE CASCADE,
        event_id UUID NOT NULL REFERENCES sso_audit_events(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        status_code INTEGER,
        response_body TEXT,
        error_message TEXT,
        attempt_number INTEGER NOT NULL DEFAULT 1,
        delivered_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_sso_webhook_deliveries_webhook ON sso_audit_webhook_deliveries (webhook_id)`);
    await queryRunner.query(`CREATE INDEX idx_sso_webhook_deliveries_status ON sso_audit_webhook_deliveries (status) WHERE status = 'pending'`);
    await queryRunner.query(`CREATE INDEX idx_sso_webhook_deliveries_created ON sso_audit_webhook_deliveries (created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_webhook_deliveries_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_webhook_deliveries_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_webhook_deliveries_webhook`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_audit_webhook_deliveries`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_webhooks_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_webhooks_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_audit_webhooks`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_alert_rules_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sso_alert_rules_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS sso_audit_alert_rules`);
  }
}
