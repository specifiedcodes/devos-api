import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutgoingWebhooksTable1771000000000 implements MigrationInterface {
  name = 'CreateOutgoingWebhooksTable1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create outgoing_webhooks table
    await queryRunner.query(`
      CREATE TABLE outgoing_webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(2000) NOT NULL,
        events TEXT[] DEFAULT ARRAY[]::TEXT[],
        headers JSONB DEFAULT '{}',
        secret_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        failure_count INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        max_consecutive_failures INTEGER DEFAULT 3,
        last_triggered_at TIMESTAMPTZ,
        last_delivery_status VARCHAR(20),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outgoing_webhooks_workspace_id ON outgoing_webhooks(workspace_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_outgoing_webhooks_workspace_active ON outgoing_webhooks(workspace_id, is_active)
    `);

    // Create webhook_delivery_logs table
    await queryRunner.query(`
      CREATE TABLE webhook_delivery_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        webhook_id UUID NOT NULL REFERENCES outgoing_webhooks(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB,
        status VARCHAR(20) DEFAULT 'pending',
        response_code INTEGER,
        response_body TEXT,
        error_message TEXT,
        attempt_number INTEGER DEFAULT 1,
        max_attempts INTEGER DEFAULT 4,
        duration_ms INTEGER,
        next_retry_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_webhook_delivery_logs_webhook_id ON webhook_delivery_logs(webhook_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_webhook_delivery_logs_webhook_created ON webhook_delivery_logs(webhook_id, created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_webhook_delivery_logs_status ON webhook_delivery_logs(status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS webhook_delivery_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS outgoing_webhooks`);
  }
}
