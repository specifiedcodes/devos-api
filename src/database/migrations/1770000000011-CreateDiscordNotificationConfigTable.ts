/**
 * Migration: CreateDiscordNotificationConfigTable
 * Story 21.3: Discord Webhook Integration (AC1)
 *
 * Creates per-event-type notification routing configuration table for Discord,
 * with unique constraint on (discord_integration_id, event_type, project_id).
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDiscordNotificationConfigTable1770000000011
  implements MigrationInterface
{
  name = 'CreateDiscordNotificationConfigTable1770000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE discord_notification_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        discord_integration_id UUID NOT NULL REFERENCES discord_integrations(id) ON DELETE CASCADE,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        event_type VARCHAR(100) NOT NULL,
        webhook_url TEXT,
        webhook_url_iv VARCHAR(100),
        channel_name VARCHAR(100),
        is_enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Unique constraint: one config per (integration, event_type, project) combination
    // COALESCE handles null project_id so global configs (project_id=null) are unique per event type
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_discord_notif_config_unique
        ON discord_notification_configs (discord_integration_id, event_type, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'));
    `);

    await queryRunner.query(`
      CREATE INDEX idx_discord_notif_config_integration
        ON discord_notification_configs (discord_integration_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_discord_notif_config_project
        ON discord_notification_configs (project_id) WHERE project_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_notif_config_project;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_notif_config_integration;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_discord_notif_config_unique;`);
    await queryRunner.query(`DROP TABLE IF EXISTS discord_notification_configs;`);
  }
}
