import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailConfigurationTables1740800000000 implements MigrationInterface {
  name = 'CreateEmailConfigurationTables1740800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE email_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL DEFAULT 'smtp',
        smtp_host VARCHAR(255),
        smtp_port INTEGER DEFAULT 587,
        smtp_user VARCHAR(255),
        smtp_pass TEXT,
        smtp_pass_iv VARCHAR(100),
        api_key TEXT,
        api_key_iv VARCHAR(100),
        from_address VARCHAR(255) NOT NULL DEFAULT 'noreply@devos.app',
        from_name VARCHAR(255) NOT NULL DEFAULT 'DevOS',
        reply_to VARCHAR(255) DEFAULT 'support@devos.app',
        connected_by UUID NOT NULL REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        rate_limit_per_hour INTEGER DEFAULT 100,
        last_sent_at TIMESTAMP WITH TIME ZONE,
        total_sent INTEGER DEFAULT 0,
        total_bounced INTEGER DEFAULT 0,
        total_complaints INTEGER DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_email_configurations_workspace ON email_configurations (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_email_configurations_status ON email_configurations (status);`);
    await queryRunner.query(`CREATE INDEX idx_email_configurations_provider ON email_configurations (provider);`);

    await queryRunner.query(`
      CREATE TABLE email_bounces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email_address VARCHAR(320) NOT NULL,
        bounce_type VARCHAR(20) NOT NULL DEFAULT 'hard',
        bounce_reason TEXT,
        original_template VARCHAR(50),
        bounced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_email_bounces_workspace ON email_bounces (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_email_bounces_email ON email_bounces (email_address);`);
    await queryRunner.query(`CREATE INDEX idx_email_bounces_type ON email_bounces (bounce_type);`);
    await queryRunner.query(`CREATE UNIQUE INDEX idx_email_bounces_workspace_email ON email_bounces (workspace_id, email_address);`);

    await queryRunner.query(`
      CREATE TABLE email_send_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        recipient_email VARCHAR(320) NOT NULL,
        template VARCHAR(50) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued',
        message_id VARCHAR(255),
        error_message TEXT,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_email_send_log_workspace ON email_send_log (workspace_id);`);
    await queryRunner.query(`CREATE INDEX idx_email_send_log_status ON email_send_log (status);`);
    await queryRunner.query(`CREATE INDEX idx_email_send_log_template ON email_send_log (template);`);
    await queryRunner.query(`CREATE INDEX idx_email_send_log_recipient ON email_send_log (recipient_email);`);
    await queryRunner.query(`CREATE INDEX idx_email_send_log_created ON email_send_log (created_at DESC);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_send_log_created;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_send_log_recipient;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_send_log_template;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_send_log_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_send_log_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_send_log;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_bounces_workspace_email;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_bounces_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_bounces_email;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_bounces_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_bounces;`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_configurations_provider;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_configurations_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_configurations_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_configurations;`);
  }
}
