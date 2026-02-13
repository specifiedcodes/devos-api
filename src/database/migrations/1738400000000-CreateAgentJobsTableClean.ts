import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentJobsTableClean1738400000000
  implements MigrationInterface
{
  name = 'CreateAgentJobsTableClean1738400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (idempotent)
    const tableExists = await queryRunner.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_jobs')`,
    );

    if (tableExists[0]?.exists) {
      return;
    }

    // Create enum types
    await queryRunner.query(
      `CREATE TYPE "public"."agent_job_type_enum" AS ENUM('spawn-agent', 'execute-task', 'recover-context', 'terminate-agent')`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."agent_job_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'retrying')`,
    );

    // Create agent_jobs table
    await queryRunner.query(`
      CREATE TABLE "agent_jobs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "workspace_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "job_type" "public"."agent_job_type_enum" NOT NULL,
        "status" "public"."agent_job_status_enum" NOT NULL DEFAULT 'pending',
        "bull_job_id" character varying,
        "data" jsonb,
        "result" jsonb,
        "error_message" text,
        "attempts" integer NOT NULL DEFAULT 0,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agent_jobs" PRIMARY KEY ("id")
      )
    `);

    // Create individual indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_jobs_workspace_id" ON "agent_jobs" ("workspace_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agent_jobs_user_id" ON "agent_jobs" ("user_id")`,
    );

    // Create composite indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_agent_jobs_workspace_created_at" ON "agent_jobs" ("workspace_id", "created_at")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agent_jobs_workspace_status" ON "agent_jobs" ("workspace_id", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agent_jobs_job_type_status" ON "agent_jobs" ("job_type", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_jobs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."agent_job_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."agent_job_type_enum"`,
    );
  }
}
