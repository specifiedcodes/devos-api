import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add configurable notification preferences fields
 * Story 10.6: Configurable Notification Preferences
 *
 * Adds new columns for:
 * - Event notification settings (epic/story completions, deployments, etc.)
 * - Channel preferences (push, in-app, email)
 * - Quiet hours configuration
 */
export class AddConfigurableNotificationPreferences1739900000000 implements MigrationInterface {
  name = 'AddConfigurableNotificationPreferences1739900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add event_settings column for notification type toggles
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "event_settings" jsonb NOT NULL DEFAULT '{
        "epicCompletions": true,
        "storyCompletions": true,
        "deploymentSuccess": true,
        "deploymentFailure": true,
        "agentErrors": true,
        "agentMessages": true,
        "statusUpdates": false
      }'::jsonb
    `);

    // Add channel_preferences column
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "channel_preferences" jsonb NOT NULL DEFAULT '{
        "push": true,
        "inApp": true,
        "email": false
      }'::jsonb
    `);

    // Add per_type_channel_overrides column
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "per_type_channel_overrides" jsonb
    `);

    // Add in_app_enabled column
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "in_app_enabled" boolean NOT NULL DEFAULT true
    `);

    // Add email_enabled column
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "email_enabled" boolean NOT NULL DEFAULT false
    `);

    // Add quiet_hours column
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD COLUMN IF NOT EXISTS "quiet_hours" jsonb NOT NULL DEFAULT '{
        "enabled": false,
        "startTime": "22:00",
        "endTime": "08:00",
        "timezone": "UTC",
        "exceptCritical": true
      }'::jsonb
    `);

    // Create index for quiet hours enabled status for efficient querying
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_preferences_quiet_hours_enabled"
      ON "notification_preferences" ((quiet_hours->>'enabled'))
      WHERE (quiet_hours->>'enabled')::boolean = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notification_preferences_quiet_hours_enabled"
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "quiet_hours"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "email_enabled"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "in_app_enabled"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "per_type_channel_overrides"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "channel_preferences"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      DROP COLUMN IF EXISTS "event_settings"
    `);
  }
}
