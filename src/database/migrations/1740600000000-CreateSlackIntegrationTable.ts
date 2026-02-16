import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSlackIntegrationTable1740600000000 implements MigrationInterface {
  name = 'CreateSlackIntegrationTable1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE slack_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        team_id VARCHAR(50) NOT NULL,
        team_name VARCHAR(255),
        bot_token TEXT NOT NULL,
        bot_token_iv VARCHAR(100) NOT NULL,
        bot_user_id VARCHAR(50),
        incoming_webhook_url TEXT,
        incoming_webhook_channel VARCHAR(100),
        default_channel_id VARCHAR(50),
        default_channel_name VARCHAR(100),
        scopes VARCHAR(1000),
        connected_by UUID NOT NULL REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        event_channel_config JSONB DEFAULT '{}',
        quiet_hours_config JSONB DEFAULT NULL,
        rate_limit_per_hour INTEGER DEFAULT 60,
        mention_config JSONB DEFAULT '{"critical": "@here", "normal": null}',
        last_message_at TIMESTAMP WITH TIME ZONE,
        message_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_error_at TIMESTAMP WITH TIME ZONE,
        connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_slack_integrations_workspace ON slack_integrations (workspace_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_slack_integrations_team ON slack_integrations (team_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_slack_integrations_status ON slack_integrations (status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_integrations_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_integrations_team;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_integrations_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS slack_integrations;`);
  }
}
