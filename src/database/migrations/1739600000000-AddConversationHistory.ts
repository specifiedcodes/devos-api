import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add conversation history support
 * Story 9.5: Conversation History Storage
 *
 * Creates conversation_threads table, extends chat_messages with
 * conversation_id, is_archived, archived_at columns, and adds
 * full-text search support.
 */
export class AddConversationHistory1739600000000 implements MigrationInterface {
  name = 'AddConversationHistory1739600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create conversation_threads table
    await queryRunner.query(`
      CREATE TABLE "conversation_threads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "project_id" uuid,
        "agent_id" uuid,
        "title" varchar(255),
        "message_count" integer NOT NULL DEFAULT 0,
        "last_message_at" TIMESTAMP WITH TIME ZONE,
        "last_message_preview" text,
        "is_archived" boolean NOT NULL DEFAULT false,
        "archived_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_threads" PRIMARY KEY ("id")
      )
    `);

    // Add foreign key constraint for workspace (cascade delete)
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      ADD CONSTRAINT "FK_conversation_threads_workspace"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Add foreign key constraint for project (cascade delete)
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      ADD CONSTRAINT "FK_conversation_threads_project"
      FOREIGN KEY ("project_id")
      REFERENCES "projects"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    // Add foreign key constraint for agent (set null on delete)
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      ADD CONSTRAINT "FK_conversation_threads_agent"
      FOREIGN KEY ("agent_id")
      REFERENCES "agents"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    // Create indexes for conversation_threads
    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_threads_workspace_id"
      ON "conversation_threads" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_threads_workspace_created_at"
      ON "conversation_threads" ("workspace_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_threads_workspace_last_message"
      ON "conversation_threads" ("workspace_id", "last_message_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_conversation_threads_workspace_agent_last_message"
      ON "conversation_threads" ("workspace_id", "agent_id", "last_message_at" DESC)
    `);

    // Add conversation_id column to chat_messages
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN "conversation_id" uuid
    `);

    // Add is_archived column to chat_messages
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN "is_archived" boolean NOT NULL DEFAULT false
    `);

    // Add archived_at column to chat_messages
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN "archived_at" TIMESTAMP WITH TIME ZONE
    `);

    // Add foreign key constraint for conversation (set null on delete)
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_conversation"
      FOREIGN KEY ("conversation_id")
      REFERENCES "conversation_threads"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    // Create index for conversation_id
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_conversation_id"
      ON "chat_messages" ("conversation_id")
    `);

    // Create composite index for workspace + conversation + createdAt
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_workspace_conversation_created_at"
      ON "chat_messages" ("workspace_id", "conversation_id", "created_at" DESC)
    `);

    // Create index for archived messages
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_is_archived"
      ON "chat_messages" ("is_archived")
      WHERE "is_archived" = true
    `);

    // Add full-text search support using generated column
    // Using a stored generated column for ts_vector
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD COLUMN "search_vector" tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce("text", ''))) STORED
    `);

    // Create GIN index for full-text search
    await queryRunner.query(`
      CREATE INDEX "IDX_chat_messages_search_vector"
      ON "chat_messages" USING GIN("search_vector")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop full-text search index and column
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_search_vector"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "search_vector"`);

    // Drop archived index
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_is_archived"`);

    // Drop conversation indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_workspace_conversation_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_conversation_id"`);

    // Drop foreign key constraint for conversation
    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      DROP CONSTRAINT IF EXISTS "FK_chat_messages_conversation"
    `);

    // Drop columns from chat_messages
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "archived_at"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "is_archived"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "conversation_id"`);

    // Drop conversation_threads indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_threads_workspace_agent_last_message"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_threads_workspace_last_message"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_threads_workspace_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversation_threads_workspace_id"`);

    // Drop foreign keys from conversation_threads
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      DROP CONSTRAINT IF EXISTS "FK_conversation_threads_agent"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      DROP CONSTRAINT IF EXISTS "FK_conversation_threads_project"
    `);
    await queryRunner.query(`
      ALTER TABLE "conversation_threads"
      DROP CONSTRAINT IF EXISTS "FK_conversation_threads_workspace"
    `);

    // Drop conversation_threads table
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_threads"`);
  }
}
