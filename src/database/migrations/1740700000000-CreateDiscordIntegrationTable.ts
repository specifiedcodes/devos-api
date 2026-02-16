import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDiscordIntegrationTable1740700000000 implements MigrationInterface {
  name = 'CreateDiscordIntegrationTable1740700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE discord_integrations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(255) DEFAULT 'Discord',
        default_webhook_url TEXT NOT NULL,
        default_webhook_url_iv VARCHAR(100) NOT NULL,
        default_webhook_id VARCHAR(100),
        default_webhook_token VARCHAR(200),
        default_channel_name VARCHAR(100),
        guild_id VARCHAR(50),
        guild_name VARCHAR(255),
        connected_by UUID NOT NULL REFERENCES users(id),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        event_webhook_config JSONB DEFAULT '{}',
        quiet_hours_config JSONB DEFAULT NULL,
        rate_limit_per_minute INTEGER DEFAULT 30,
        mention_config JSONB DEFAULT '{"critical": null, "normal": null}',
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
      CREATE UNIQUE INDEX idx_discord_integrations_workspace ON discord_integrations (workspace_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_discord_integrations_guild ON discord_integrations (guild_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_discord_integrations_status ON discord_integrations (status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_integrations_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_integrations_guild;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_integrations_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS discord_integrations;`);
  }
}
