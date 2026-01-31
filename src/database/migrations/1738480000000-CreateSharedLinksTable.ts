import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSharedLinksTable1738480000000 implements MigrationInterface {
  name = 'CreateSharedLinksTable1738480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create shared_links table
    await queryRunner.query(`
      CREATE TABLE "shared_links" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "token" character varying(64) NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "password_hash" character varying(255),
        "is_active" boolean NOT NULL DEFAULT true,
        "view_count" integer NOT NULL DEFAULT 0,
        "last_viewed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shared_links" PRIMARY KEY ("id")
      )
    `);

    // Create unique index on token
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_shared_links_token" ON "shared_links" ("token")
    `);

    // Create index on project_id
    await queryRunner.query(`
      CREATE INDEX "idx_shared_links_project_id" ON "shared_links" ("project_id")
    `);

    // Create index on workspace_id
    await queryRunner.query(`
      CREATE INDEX "idx_shared_links_workspace_id" ON "shared_links" ("workspace_id")
    `);

    // Create index on is_active
    await queryRunner.query(`
      CREATE INDEX "idx_shared_links_is_active" ON "shared_links" ("is_active")
    `);

    // Create composite index on (token, is_active) for fast lookups
    await queryRunner.query(`
      CREATE INDEX "idx_shared_links_token_active" ON "shared_links" ("token", "is_active")
    `);

    // Add foreign key constraint to projects table
    await queryRunner.query(`
      ALTER TABLE "shared_links"
      ADD CONSTRAINT "FK_shared_links_project"
      FOREIGN KEY ("project_id")
      REFERENCES "projects"("id")
      ON DELETE CASCADE
    `);

    // Add foreign key constraint to workspaces table
    await queryRunner.query(`
      ALTER TABLE "shared_links"
      ADD CONSTRAINT "FK_shared_links_workspace"
      FOREIGN KEY ("workspace_id")
      REFERENCES "workspaces"("id")
      ON DELETE CASCADE
    `);

    // Add foreign key constraint to users table
    await queryRunner.query(`
      ALTER TABLE "shared_links"
      ADD CONSTRAINT "FK_shared_links_user"
      FOREIGN KEY ("created_by_user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "shared_links" DROP CONSTRAINT "FK_shared_links_user"
    `);

    await queryRunner.query(`
      ALTER TABLE "shared_links" DROP CONSTRAINT "FK_shared_links_workspace"
    `);

    await queryRunner.query(`
      ALTER TABLE "shared_links" DROP CONSTRAINT "FK_shared_links_project"
    `);

    // Drop indexes
    await queryRunner.query(`DROP INDEX "idx_shared_links_token_active"`);
    await queryRunner.query(`DROP INDEX "idx_shared_links_is_active"`);
    await queryRunner.query(`DROP INDEX "idx_shared_links_workspace_id"`);
    await queryRunner.query(`DROP INDEX "idx_shared_links_project_id"`);
    await queryRunner.query(`DROP INDEX "idx_shared_links_token"`);

    // Drop table
    await queryRunner.query(`DROP TABLE "shared_links"`);
  }
}
