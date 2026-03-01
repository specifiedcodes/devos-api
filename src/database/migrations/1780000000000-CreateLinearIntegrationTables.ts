import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLinearIntegrationTables1780000000000 implements MigrationInterface {
  name = 'CreateLinearIntegrationTables1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create linear_integrations table
    await queryRunner.query(`
      CREATE TABLE "linear_integrations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "linear_team_id" varchar(100) NOT NULL,
        "linear_team_name" varchar(255),
        "access_token" text NOT NULL,
        "access_token_iv" varchar(100) NOT NULL,
        "status_mapping" jsonb DEFAULT '{"backlog":"Backlog","in_progress":"In Progress","review":"In Review","done":"Done"}',
        "field_mapping" jsonb DEFAULT '{"title":"title","description":"description","storyPoints":"estimate","priority":"priority"}',
        "sync_direction" varchar(20) DEFAULT 'bidirectional',
        "webhook_secret" varchar(255),
        "webhook_secret_iv" varchar(100),
        "is_active" boolean DEFAULT true,
        "connected_by" uuid NOT NULL,
        "last_sync_at" timestamptz,
        "last_error" text,
        "last_error_at" timestamptz,
        "error_count" integer DEFAULT 0,
        "sync_count" integer DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_linear_integrations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_linear_integrations_workspace" ON "linear_integrations" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linear_integrations_team" ON "linear_integrations" ("linear_team_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linear_integrations_active" ON "linear_integrations" ("is_active")
    `);

    await queryRunner.query(`
      ALTER TABLE "linear_integrations"
      ADD CONSTRAINT "FK_linear_integrations_workspace"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "linear_integrations"
      ADD CONSTRAINT "FK_linear_integrations_user"
      FOREIGN KEY ("connected_by") REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

    // Create linear_sync_items table
    await queryRunner.query(`
      CREATE TABLE "linear_sync_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "devos_story_id" uuid NOT NULL,
        "linear_issue_id" varchar(100) NOT NULL,
        "linear_issue_identifier" varchar(50),
        "last_sync_at" timestamptz,
        "sync_status" varchar(20) DEFAULT 'synced',
        "last_error" text,
        "devos_hash" varchar(64),
        "linear_hash" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_linear_sync_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_linear_sync_items_workspace" ON "linear_sync_items" ("workspace_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_linear_sync_items_story" ON "linear_sync_items" ("devos_story_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_linear_sync_items_linear_issue" ON "linear_sync_items" ("linear_issue_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "linear_sync_items"
      ADD CONSTRAINT "FK_linear_sync_items_workspace"
      FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "linear_sync_items"
      ADD CONSTRAINT "FK_linear_sync_items_story"
      FOREIGN KEY ("devos_story_id") REFERENCES "stories"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "linear_sync_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "linear_integrations"`);
  }
}
