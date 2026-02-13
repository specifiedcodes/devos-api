import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create notification_preferences table
 * Story 9.9: Chat Notifications
 */
export class CreateNotificationPreferences1739500000000 implements MigrationInterface {
  name = 'CreateNotificationPreferences1739500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification_preferences table
    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "push_enabled" boolean NOT NULL DEFAULT true,
        "sound_enabled" boolean NOT NULL DEFAULT true,
        "sound_volume" decimal(2,1) NOT NULL DEFAULT 0.5,
        "sound_file" varchar(50) NOT NULL DEFAULT 'default',
        "dnd_enabled" boolean NOT NULL DEFAULT false,
        "dnd_schedule" jsonb,
        "agent_settings" jsonb NOT NULL DEFAULT '{}',
        "type_settings" jsonb NOT NULL DEFAULT '{"chatMessages":true,"statusUpdates":true,"taskCompletions":true,"errors":true,"mentions":true}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_user_workspace" UNIQUE ("user_id", "workspace_id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_preferences_user_id" ON "notification_preferences" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_preferences_workspace_id" ON "notification_preferences" ("workspace_id")
    `);

    // Add foreign keys
    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD CONSTRAINT "FK_notification_preferences_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD CONSTRAINT "FK_notification_preferences_workspace"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Add index on chat_messages for unread tracking (if not exists)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chat_messages_unread"
      ON "chat_messages" ("workspace_id", "sender_type", "read_at")
      WHERE "read_at" IS NULL AND "sender_type" = 'agent'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes on chat_messages
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_chat_messages_unread"
    `);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE "notification_preferences" DROP CONSTRAINT IF EXISTS "FK_notification_preferences_workspace"
    `);

    await queryRunner.query(`
      ALTER TABLE "notification_preferences" DROP CONSTRAINT IF EXISTS "FK_notification_preferences_user"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notification_preferences_workspace_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notification_preferences_user_id"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "notification_preferences"
    `);
  }
}
