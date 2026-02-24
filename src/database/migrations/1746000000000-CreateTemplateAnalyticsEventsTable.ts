import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Template Analytics Events Table
 *
 * Story 19-9: Template Analytics
 *
 * Creates the template_analytics_events table for tracking template views,
 * installations, and other interactions with proper indexes for efficient querying.
 */
export class CreateTemplateAnalyticsEventsTable1746000000000 implements MigrationInterface {
  name = 'CreateTemplateAnalyticsEventsTable1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create event type enum
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'template_analytics_event_type_enum') THEN
          CREATE TYPE "template_analytics_event_type_enum" AS ENUM (
            'view', 'detail_view', 'install_started', 'install_completed', 'install_failed', 'review_submitted'
          );
        END IF;
      END $$;
    `);

    // Create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "template_analytics_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "template_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "user_id" uuid,
        "event_type" "template_analytics_event_type_enum" NOT NULL,
        "referrer" varchar(500),
        "metadata" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_template_analytics_events" PRIMARY KEY ("id")
      )
    `);

    // Add foreign keys
    await queryRunner.query(`
      ALTER TABLE "template_analytics_events"
      ADD CONSTRAINT "fk_template_analytics_template"
      FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "template_analytics_events"
      ADD CONSTRAINT "fk_template_analytics_workspace"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "template_analytics_events"
      ADD CONSTRAINT "fk_template_analytics_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Create indexes for efficient queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_analytics_template_created"
      ON "template_analytics_events" ("template_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_analytics_event_type"
      ON "template_analytics_events" ("event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_analytics_workspace_created"
      ON "template_analytics_events" ("workspace_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_analytics_user_created"
      ON "template_analytics_events" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_analytics_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_analytics_workspace_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_analytics_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_analytics_template_created"`);

    // Drop table (cascades foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "template_analytics_events"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "template_analytics_event_type_enum"`);
  }
}
