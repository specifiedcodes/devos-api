import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Multi-User Chat Tables
 * Story 9.10: Multi-User Chat
 *
 * Creates tables for chat rooms, room members, invitations,
 * restrictions, moderation log, and pinned messages.
 */
export class CreateMultiUserChat1739700000000 implements MigrationInterface {
  name = 'CreateMultiUserChat1739700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create chat_room_type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."chat_room_type_enum" AS ENUM ('direct', 'project', 'workspace', 'group');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create chat_room_member_role enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."chat_room_member_role_enum" AS ENUM ('owner', 'admin', 'member', 'readonly');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create chat_room_member_type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."chat_room_member_type_enum" AS ENUM ('user', 'agent');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create invitation_status enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."invitation_status_enum" AS ENUM ('pending', 'accepted', 'declined', 'expired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create restriction_type enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."restriction_type_enum" AS ENUM ('mute', 'ban');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create moderation_action enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."moderation_action_enum" AS ENUM (
          'delete_message', 'edit_message', 'mute_user', 'unmute_user',
          'kick_user', 'ban_user', 'unban_user', 'pin_message',
          'unpin_message', 'lock_room', 'unlock_room'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create chat_rooms table
    await queryRunner.query(`
      CREATE TABLE "chat_rooms" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL,
        "project_id" uuid,
        "name" varchar(100) NOT NULL,
        "description" text,
        "type" "public"."chat_room_type_enum" NOT NULL DEFAULT 'group',
        "is_private" boolean NOT NULL DEFAULT false,
        "is_locked" boolean NOT NULL DEFAULT false,
        "created_by_id" uuid NOT NULL,
        "settings" jsonb NOT NULL DEFAULT '{"allowAgents":true,"threadingEnabled":false,"reactionsEnabled":true}',
        "member_count" integer NOT NULL DEFAULT 0,
        "last_message_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_rooms" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_rooms_workspace" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_rooms_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_rooms_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create chat_room_members table
    await queryRunner.query(`
      CREATE TABLE "chat_room_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "user_id" uuid,
        "agent_id" uuid,
        "member_type" "public"."chat_room_member_type_enum" NOT NULL,
        "role" "public"."chat_room_member_role_enum" NOT NULL DEFAULT 'member',
        "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "last_read_at" TIMESTAMPTZ,
        "is_muted" boolean NOT NULL DEFAULT false,
        "muted_until" TIMESTAMPTZ,
        CONSTRAINT "PK_chat_room_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_room_members_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_room_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_room_members_agent" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_chat_room_members_room_user" UNIQUE ("room_id", "user_id"),
        CONSTRAINT "UQ_chat_room_members_room_agent" UNIQUE ("room_id", "agent_id"),
        CONSTRAINT "CK_chat_room_members_user_or_agent" CHECK (
          (user_id IS NOT NULL AND agent_id IS NULL) OR
          (user_id IS NULL AND agent_id IS NOT NULL)
        )
      )
    `);

    // Create chat_room_invitations table
    await queryRunner.query(`
      CREATE TABLE "chat_room_invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "invited_by_id" uuid NOT NULL,
        "invited_user_id" uuid NOT NULL,
        "status" "public"."invitation_status_enum" NOT NULL DEFAULT 'pending',
        "role" "public"."chat_room_member_role_enum" NOT NULL DEFAULT 'member',
        "message" text,
        "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
        "responded_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_room_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_room_invitations_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_room_invitations_invited_by" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_chat_room_invitations_invited_user" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create user_room_restrictions table
    await queryRunner.query(`
      CREATE TABLE "user_room_restrictions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "public"."restriction_type_enum" NOT NULL,
        "reason" text,
        "expires_at" TIMESTAMPTZ,
        "created_by_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_room_restrictions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_room_restrictions_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_room_restrictions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_room_restrictions_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_user_room_restrictions_room_user_type" UNIQUE ("room_id", "user_id", "type")
      )
    `);

    // Create moderation_log table
    await queryRunner.query(`
      CREATE TABLE "moderation_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "moderator_id" uuid NOT NULL,
        "action" "public"."moderation_action_enum" NOT NULL,
        "target_user_id" uuid,
        "target_message_id" uuid,
        "reason" text,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_moderation_log" PRIMARY KEY ("id"),
        CONSTRAINT "FK_moderation_log_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_moderation_log_moderator" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_moderation_log_target_user" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_moderation_log_target_message" FOREIGN KEY ("target_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL
      )
    `);

    // Create pinned_messages table
    await queryRunner.query(`
      CREATE TABLE "pinned_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "room_id" uuid NOT NULL,
        "message_id" uuid NOT NULL,
        "pinned_by_id" uuid NOT NULL,
        "pinned_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pinned_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pinned_messages_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pinned_messages_message" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pinned_messages_pinned_by" FOREIGN KEY ("pinned_by_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pinned_messages_room_message" UNIQUE ("room_id", "message_id")
      )
    `);

    // Add room_id column to chat_messages table
    await queryRunner.query(`
      ALTER TABLE "chat_messages" ADD COLUMN "room_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "chat_messages"
      ADD CONSTRAINT "FK_chat_messages_room" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE
    `);

    // Create indexes for chat_rooms
    await queryRunner.query(`CREATE INDEX "IDX_chat_rooms_workspace_id" ON "chat_rooms" ("workspace_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_rooms_workspace_type" ON "chat_rooms" ("workspace_id", "type")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_rooms_workspace_created" ON "chat_rooms" ("workspace_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_rooms_project_id" ON "chat_rooms" ("project_id")`);

    // Create indexes for chat_room_members
    await queryRunner.query(`CREATE INDEX "IDX_chat_room_members_room_id" ON "chat_room_members" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_room_members_user_id" ON "chat_room_members" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_room_members_agent_id" ON "chat_room_members" ("agent_id")`);

    // Create indexes for chat_room_invitations
    await queryRunner.query(`CREATE INDEX "IDX_chat_room_invitations_user_status" ON "chat_room_invitations" ("invited_user_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_room_invitations_room_status" ON "chat_room_invitations" ("room_id", "status")`);

    // Create indexes for user_room_restrictions
    await queryRunner.query(`CREATE INDEX "IDX_user_room_restrictions_room_id" ON "user_room_restrictions" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_room_restrictions_user_id" ON "user_room_restrictions" ("user_id")`);

    // Create indexes for moderation_log
    await queryRunner.query(`CREATE INDEX "IDX_moderation_log_room_created" ON "moderation_log" ("room_id", "created_at" DESC)`);

    // Create indexes for pinned_messages
    await queryRunner.query(`CREATE INDEX "IDX_pinned_messages_room_pinned" ON "pinned_messages" ("room_id", "pinned_at" DESC)`);

    // Create index for room_id on chat_messages
    await queryRunner.query(`CREATE INDEX "IDX_chat_messages_room_id" ON "chat_messages" ("room_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_chat_messages_room_created" ON "chat_messages" ("room_id", "created_at")`);
    // Covering index for cursor-based pagination (room_id, id) - optimizes message history loading
    await queryRunner.query(`CREATE INDEX "IDX_chat_messages_room_pagination" ON "chat_messages" ("room_id", "id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes from chat_messages
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_room_pagination"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_room_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_messages_room_id"`);

    // Drop foreign key and column from chat_messages
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "FK_chat_messages_room"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN IF EXISTS "room_id"`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pinned_messages_room_pinned"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_moderation_log_room_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_room_restrictions_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_room_restrictions_room_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_invitations_room_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_invitations_user_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_members_agent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_members_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_members_room_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_rooms_project_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_rooms_workspace_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_rooms_workspace_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_rooms_workspace_id"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "pinned_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "moderation_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_room_restrictions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_invitations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_rooms"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."moderation_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."restriction_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."invitation_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."chat_room_member_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."chat_room_member_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."chat_room_type_enum"`);
  }
}
