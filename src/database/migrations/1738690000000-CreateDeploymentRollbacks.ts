import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeploymentRollbacks1738690000000 implements MigrationInterface {
  name = 'CreateDeploymentRollbacks1738690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for deployment_rollback_status
    await queryRunner.query(`
      CREATE TYPE "deployment_rollback_status_enum" AS ENUM ('in_progress', 'success', 'failed')
    `);

    // Create enum type for deployment_rollback_trigger_type
    await queryRunner.query(`
      CREATE TYPE "deployment_rollback_trigger_type_enum" AS ENUM ('manual', 'automatic')
    `);

    // Create deployment_rollbacks table
    await queryRunner.query(`
      CREATE TABLE "deployment_rollbacks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "platform" varchar(20) NOT NULL,
        "deployment_id" varchar(100) NOT NULL,
        "target_deployment_id" varchar(100),
        "new_deployment_id" varchar(100),
        "environment" varchar(20) NOT NULL,
        "status" "deployment_rollback_status_enum" NOT NULL DEFAULT 'in_progress',
        "reason" text,
        "trigger_type" "deployment_rollback_trigger_type_enum" NOT NULL DEFAULT 'manual',
        "initiated_by" uuid NOT NULL,
        "error_message" text,
        "initiated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        CONSTRAINT "PK_deployment_rollbacks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_deployment_rollbacks_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_deployment_rollbacks_project_status" ON "deployment_rollbacks" ("project_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_deployment_rollbacks_workspace" ON "deployment_rollbacks" ("workspace_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_deployment_rollbacks_initiated_at" ON "deployment_rollbacks" ("initiated_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_deployment_rollbacks_initiated_at"`);
    await queryRunner.query(`DROP INDEX "IDX_deployment_rollbacks_workspace"`);
    await queryRunner.query(`DROP INDEX "IDX_deployment_rollbacks_project_status"`);
    await queryRunner.query(`DROP TABLE "deployment_rollbacks"`);
    await queryRunner.query(`DROP TYPE "deployment_rollback_trigger_type_enum"`);
    await queryRunner.query(`DROP TYPE "deployment_rollback_status_enum"`);
  }
}
