/**
 * Migration: Create Discord Bot Tables
 * Story 21.4: Discord Bot (Optional) (AC1)
 *
 * Creates tables for:
 * - discord_bot_configs: Bot configuration per guild
 * - discord_user_links: Discord-to-DevOS user mapping
 * - discord_interaction_logs: Bot interaction audit log
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDiscordBotTables1772000000000 implements MigrationInterface {
  name = 'CreateDiscordBotTables1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create discord_bot_configs table
    await queryRunner.query(`
      CREATE TABLE "discord_bot_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "discord_integration_id" uuid NOT NULL,
        "guild_id" varchar(50) NOT NULL,
        "bot_token" text NOT NULL,
        "bot_token_iv" varchar(100) NOT NULL,
        "application_id" varchar(50) NOT NULL,
        "public_key" varchar(100),
        "command_channel_id" varchar(50),
        "command_channel_name" varchar(100),
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "is_active" boolean NOT NULL DEFAULT true,
        "enabled_commands" jsonb NOT NULL DEFAULT '{}',
        "command_count" integer NOT NULL DEFAULT 0,
        "error_count" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "last_error_at" timestamptz,
        "last_command_at" timestamptz,
        "configured_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discord_bot_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_discord_bot_configs_integration" UNIQUE ("discord_integration_id"),
        CONSTRAINT "UQ_discord_bot_configs_guild" UNIQUE ("guild_id")
      )
    `);

    // FK: discord_integration_id -> discord_integrations.id (CASCADE)
    await queryRunner.query(`
      ALTER TABLE "discord_bot_configs"
      ADD CONSTRAINT "FK_discord_bot_configs_integration"
      FOREIGN KEY ("discord_integration_id") REFERENCES "discord_integrations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // FK: configured_by -> users.id (SET NULL)
    await queryRunner.query(`
      ALTER TABLE "discord_bot_configs"
      ALTER COLUMN "configured_by" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "discord_bot_configs"
      ADD CONSTRAINT "FK_discord_bot_configs_configured_by"
      FOREIGN KEY ("configured_by") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Indexes for discord_bot_configs
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_discord_bot_configs_integration"
      ON "discord_bot_configs" ("discord_integration_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_discord_bot_configs_guild"
      ON "discord_bot_configs" ("guild_id")
    `);

    // 2. Create discord_user_links table
    await queryRunner.query(`
      CREATE TABLE "discord_user_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "discord_integration_id" uuid NOT NULL,
        "devos_user_id" uuid,
        "discord_user_id" varchar(50) NOT NULL,
        "discord_username" varchar(255),
        "discord_display_name" varchar(255),
        "status" varchar(20) NOT NULL DEFAULT 'linked',
        "link_token" varchar(100),
        "link_token_expires_at" timestamptz,
        "linked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discord_user_links" PRIMARY KEY ("id")
      )
    `);

    // FK: workspace_id -> workspaces.id (CASCADE)
    await queryRunner.query(`
      ALTER TABLE "discord_user_links"
      ADD CONSTRAINT "FK_discord_user_links_workspace"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // FK: discord_integration_id -> discord_integrations.id (CASCADE)
    await queryRunner.query(`
      ALTER TABLE "discord_user_links"
      ADD CONSTRAINT "FK_discord_user_links_integration"
      FOREIGN KEY ("discord_integration_id") REFERENCES "discord_integrations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // FK: devos_user_id -> users.id (SET NULL, nullable for pending links)
    await queryRunner.query(`
      ALTER TABLE "discord_user_links"
      ADD CONSTRAINT "FK_discord_user_links_user"
      FOREIGN KEY ("devos_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Indexes for discord_user_links
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_discord_user_links_workspace_discord"
      ON "discord_user_links" ("workspace_id", "discord_user_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_discord_user_links_workspace_devos"
      ON "discord_user_links" ("workspace_id", "devos_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_discord_user_links_integration"
      ON "discord_user_links" ("discord_integration_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_discord_user_links_token"
      ON "discord_user_links" ("link_token")
      WHERE "link_token" IS NOT NULL
    `);

    // 3. Create discord_interaction_logs table
    await queryRunner.query(`
      CREATE TABLE "discord_interaction_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "discord_integration_id" uuid NOT NULL,
        "discord_user_id" varchar(50) NOT NULL,
        "devos_user_id" uuid,
        "command_name" varchar(50) NOT NULL,
        "command_args" varchar(500),
        "result_status" varchar(20) NOT NULL DEFAULT 'pending',
        "result_message" text,
        "response_time_ms" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discord_interaction_logs" PRIMARY KEY ("id")
      )
    `);

    // Indexes for discord_interaction_logs
    await queryRunner.query(`
      CREATE INDEX "IDX_discord_interaction_logs_workspace_created"
      ON "discord_interaction_logs" ("workspace_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_discord_interaction_logs_integration"
      ON "discord_interaction_logs" ("discord_integration_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_discord_interaction_logs_discord_user"
      ON "discord_interaction_logs" ("discord_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_interaction_logs_discord_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_interaction_logs_integration"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_interaction_logs_workspace_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_user_links_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_user_links_integration"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_user_links_workspace_devos"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_user_links_workspace_discord"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_bot_configs_guild"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_discord_bot_configs_integration"`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE IF EXISTS "discord_interaction_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discord_user_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discord_bot_configs"`);
  }
}
