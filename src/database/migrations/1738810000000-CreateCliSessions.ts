import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to create cli_sessions table
 * Story 8.5: CLI Session History and Replay
 *
 * Creates table for storing completed CLI session history
 * with compression support and workspace isolation.
 */
export class CreateCliSessions1738810000000 implements MigrationInterface {
  name = 'CreateCliSessions1738810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agent type enum if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cli_session_agent_type_enum" AS ENUM (
          'dev', 'qa', 'devops', 'planner', 'security',
          'frontend', 'backend', 'database', 'performance'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create status enum if it doesn't exist
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "cli_session_status_enum" AS ENUM (
          'completed', 'failed', 'terminated'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create cli_sessions table
    await queryRunner.query(`
      CREATE TABLE "cli_sessions" (
        "id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "project_id" uuid,
        "story_key" character varying(50),
        "agent_type" "cli_session_agent_type_enum" NOT NULL,
        "output_text" text NOT NULL,
        "line_count" integer NOT NULL,
        "output_size_bytes" integer NOT NULL,
        "status" "cli_session_status_enum" NOT NULL,
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "duration_seconds" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cli_sessions" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key for workspace (cascade delete)
    await queryRunner.query(`
      ALTER TABLE "cli_sessions"
      ADD CONSTRAINT "FK_cli_sessions_workspace"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Create indexes for query optimization
    // Index for workspace + startedAt (most common query pattern)
    await queryRunner.query(`
      CREATE INDEX "IDX_cli_sessions_workspace_started_at"
      ON "cli_sessions" ("workspace_id", "started_at" DESC)
    `);

    // Index for workspace + agentType (filtering)
    await queryRunner.query(`
      CREATE INDEX "IDX_cli_sessions_workspace_agent_type"
      ON "cli_sessions" ("workspace_id", "agent_type")
    `);

    // Index for workspace + status (filtering)
    await queryRunner.query(`
      CREATE INDEX "IDX_cli_sessions_workspace_status"
      ON "cli_sessions" ("workspace_id", "status")
    `);

    // Index for agentId lookup
    await queryRunner.query(`
      CREATE INDEX "IDX_cli_sessions_agent_id"
      ON "cli_sessions" ("agent_id")
    `);

    // Index for projectId lookup (nullable)
    await queryRunner.query(`
      CREATE INDEX "IDX_cli_sessions_project_id"
      ON "cli_sessions" ("project_id")
      WHERE "project_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cli_sessions_project_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cli_sessions_agent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cli_sessions_workspace_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cli_sessions_workspace_agent_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cli_sessions_workspace_started_at"`);

    // Drop foreign key
    await queryRunner.query(`
      ALTER TABLE "cli_sessions"
      DROP CONSTRAINT IF EXISTS "FK_cli_sessions_workspace"
    `);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "cli_sessions"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "cli_session_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cli_session_agent_type_enum"`);
  }
}
