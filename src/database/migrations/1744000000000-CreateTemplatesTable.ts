import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTemplatesTable1744000000000 implements MigrationInterface {
  name = 'CreateTemplatesTable1744000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if templates table already exists (idempotent)
    const templatesTableExists = await queryRunner.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'templates')`,
    );

    if (templatesTableExists[0]?.exists) {
      return;
    }

    // Create enum types for source_type (check existence for idempotency)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."template_source_type_enum" AS ENUM('git', 'archive', 'inline');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    // Create templates table
    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "name" VARCHAR(100) NOT NULL,
        "display_name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "long_description" TEXT,
        "version" VARCHAR(50) NOT NULL DEFAULT '1.0.0',
        "schema_version" VARCHAR(10) NOT NULL DEFAULT 'v1',
        "definition" JSONB NOT NULL,
        "category" VARCHAR(50) NOT NULL DEFAULT 'web-app',
        "tags" TEXT[] DEFAULT '{}',
        "icon" VARCHAR(100) DEFAULT 'layout-dashboard',
        "screenshots" TEXT[] DEFAULT '{}',
        "stack_summary" JSONB DEFAULT '{}',
        "variables" JSONB DEFAULT '[]',
        "source_type" VARCHAR(20) NOT NULL DEFAULT 'git',
        "source_url" TEXT,
        "source_branch" VARCHAR(100) DEFAULT 'main',
        "is_official" BOOLEAN NOT NULL DEFAULT false,
        "is_published" BOOLEAN NOT NULL DEFAULT false,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "total_uses" INTEGER NOT NULL DEFAULT 0,
        "avg_rating" DECIMAL(3,2) DEFAULT 0.00,
        "rating_count" INTEGER NOT NULL DEFAULT 0,
        "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_template_workspace_name" UNIQUE ("workspace_id", "name"),
        CONSTRAINT "ck_template_source_type" CHECK ("source_type" IN ('git', 'archive', 'inline'))
      )
    `);

    // Create indexes for templates table
    await queryRunner.query(
      `CREATE INDEX "idx_template_workspace" ON "templates" ("workspace_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_workspace_active" ON "templates" ("workspace_id", "is_active")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_category" ON "templates" ("category")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_is_official" ON "templates" ("is_official") WHERE "is_official" = true`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_is_published" ON "templates" ("is_published") WHERE "is_published" = true`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_created_by" ON "templates" ("created_by")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_tags" ON "templates" USING GIN ("tags")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_definition" ON "templates" USING GIN ("definition")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_rating" ON "templates" ("avg_rating" DESC) WHERE "is_published" = true`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_uses" ON "templates" ("total_uses" DESC) WHERE "is_published" = true`,
    );

    // Create template_audit_events table
    await queryRunner.query(`
      CREATE TABLE "template_audit_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "template_id" UUID REFERENCES "templates"("id") ON DELETE SET NULL,
        "event_type" VARCHAR(60) NOT NULL,
        "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "details" JSONB DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create indexes for template_audit_events table
    await queryRunner.query(
      `CREATE INDEX "idx_template_audit_workspace" ON "template_audit_events" ("workspace_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_audit_template" ON "template_audit_events" ("template_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_audit_event_type" ON "template_audit_events" ("event_type")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_audit_actor" ON "template_audit_events" ("actor_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_template_audit_created" ON "template_audit_events" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop template_audit_events table and its indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_audit_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_audit_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_audit_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_audit_template"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_audit_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "template_audit_events"`);

    // Drop templates table and its indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_uses"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_rating"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_definition"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_is_published"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_is_official"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_category"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_workspace_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_workspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."template_source_type_enum"`);
  }
}
