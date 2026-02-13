import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to create chat_messages table
 * Story 9.2: Send Message to Agent
 *
 * Creates table for storing chat messages between users and agents
 * with full workspace isolation and optimized indexes for query patterns.
 */
export class CreateChatMessages1738820000000 implements MigrationInterface {
  name = 'CreateChatMessages1738820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sender type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_message_sender_type_enum" AS ENUM ('user', 'agent');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create message status enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "chat_message_status_enum" AS ENUM ('sent', 'delivered', 'read');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create chat_messages table
    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "project_id" uuid,
        "agent_id" uuid,
        "user_id" uuid,
        "sender_type" "chat_message_sender_type_enum" NOT NULL,
        "agent_type" "agents_type_enum",
        "text" text NOT NULL,
        "is_status_update" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "status" "chat_message_status_enum" NOT NULL DEFAULT 'sent',
        "delivered_at" TIMESTAMP WITH TIME ZONE,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraint for workspace (cascade delete)
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_workspace"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Add foreign key constraint for project (cascade delete)
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_project"
      FOREIGN KEY ("project_id")
      REFERENCES "projects"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Add foreign key constraint for agent (set null on delete)
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_agent"
      FOREIGN KEY ("agent_id")
      REFERENCES "agents"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    // Add foreign key constraint for user (set null on delete)
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_user"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    // Create index for workspace_id (used for workspace isolation)
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_workspace_id"
      ON "chat_messages" ("workspace_id")
    `);

    // Create composite index for workspace + createdAt (timeline queries)
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_workspace_created_at"
      ON "chat_messages" ("workspace_id", "created_at" DESC)
    `);

    // Create composite index for workspace + agent + createdAt (agent-filtered queries)
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_workspace_agent_created_at"
      ON "chat_messages" ("workspace_id", "agent_id", "created_at" DESC)
    `);

    // Create composite index for workspace + user + createdAt (user-filtered queries)
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_workspace_user_created_at"
      ON "chat_messages" ("workspace_id", "user_id", "created_at" DESC)
    `);

    // Create index for project_id (nullable - partial index)
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_project_id"
      ON "chat_messages" ("project_id")
      WHERE "project_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_project_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_workspace_user_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_workspace_agent_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_workspace_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_workspace_id"`);

    // Drop foreign keys
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "FK_chat_messages_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "FK_chat_messages_agent"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "FK_chat_messages_project"
    `);
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "FK_chat_messages_workspace"
    `);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_message_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_message_sender_type_enum"`);
  }
}
