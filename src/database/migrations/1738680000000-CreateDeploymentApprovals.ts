import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeploymentApprovals1738680000000 implements MigrationInterface {
  name = 'CreateDeploymentApprovals1738680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for deployment_approval_mode
    await queryRunner.query(`
      CREATE TYPE "deployment_approval_mode_enum" AS ENUM ('automatic', 'manual', 'staging_auto_production_manual')
    `);

    // Add column to project_preferences
    await queryRunner.query(`
      ALTER TABLE "project_preferences"
      ADD COLUMN "deployment_approval_mode" "deployment_approval_mode_enum" NOT NULL DEFAULT 'automatic'
    `);

    // Create enum type for deployment_approval_status
    await queryRunner.query(`
      CREATE TYPE "deployment_approval_status_enum" AS ENUM ('pending', 'approved', 'rejected', 'expired')
    `);

    // Create deployment_approvals table
    await queryRunner.query(`
      CREATE TABLE "deployment_approvals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "platform" varchar(20) NOT NULL,
        "branch" varchar(200) NOT NULL,
        "commit_sha" varchar(40),
        "environment" varchar(20) NOT NULL,
        "status" "deployment_approval_status_enum" NOT NULL DEFAULT 'pending',
        "story_id" varchar(50),
        "story_title" varchar(200),
        "changes" jsonb,
        "test_results" jsonb,
        "requested_by" varchar(100) NOT NULL DEFAULT 'system',
        "reviewed_by" uuid,
        "rejection_reason" text,
        "requested_at" TIMESTAMP NOT NULL DEFAULT now(),
        "reviewed_at" TIMESTAMP,
        CONSTRAINT "PK_deployment_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deployment_approvals_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_deployment_approvals_project_status" ON "deployment_approvals" ("project_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_deployment_approvals_workspace" ON "deployment_approvals" ("workspace_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_deployment_approvals_requested_at" ON "deployment_approvals" ("requested_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_deployment_approvals_requested_at"`);
    await queryRunner.query(`DROP INDEX "IDX_deployment_approvals_workspace"`);
    await queryRunner.query(`DROP INDEX "IDX_deployment_approvals_project_status"`);
    await queryRunner.query(`DROP TABLE "deployment_approvals"`);
    await queryRunner.query(`DROP TYPE "deployment_approval_status_enum"`);
    await queryRunner.query(`ALTER TABLE "project_preferences" DROP COLUMN "deployment_approval_mode"`);
    await queryRunner.query(`DROP TYPE "deployment_approval_mode_enum"`);
  }
}
