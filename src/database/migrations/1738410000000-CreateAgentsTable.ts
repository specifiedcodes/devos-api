import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentsTable1738410000000 implements MigrationInterface {
  name = 'CreateAgentsTable1738410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (idempotent)
    const tableExists = await queryRunner.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agents')`,
    );

    if (tableExists[0]?.exists) {
      return;
    }

    // Create enum types (check existence for idempotency)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."agent_type_enum" AS ENUM('dev', 'planner', 'qa', 'devops', 'orchestrator');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."agent_status_enum" AS ENUM('created', 'initializing', 'running', 'paused', 'completed', 'failed', 'terminated');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    // Create agents table
    await queryRunner.query(`
      CREATE TABLE "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "type" "public"."agent_type_enum" NOT NULL,
        "status" "public"."agent_status_enum" NOT NULL DEFAULT 'created',
        "workspace_id" uuid NOT NULL,
        "project_id" uuid,
        "created_by" uuid NOT NULL,
        "config" jsonb,
        "context" jsonb,
        "current_task" text,
        "error_message" text,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "last_heartbeat" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agents" PRIMARY KEY ("id")
      )
    `);

    // Create individual indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_agents_workspace_id" ON "agents" ("workspace_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agents_project_id" ON "agents" ("project_id")`,
    );

    // Create composite indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_agents_workspace_status" ON "agents" ("workspace_id", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agents_project_status" ON "agents" ("project_id", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_agents_type_status" ON "agents" ("type", "status")`,
    );

    // Create foreign key constraints with CASCADE on delete
    await queryRunner.query(`
      ALTER TABLE "agents"
        ADD CONSTRAINT "FK_agents_workspace_id"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "agents"
        ADD CONSTRAINT "FK_agents_project_id"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "agents"
        ADD CONSTRAINT "FK_agents_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agents"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."agent_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."agent_type_enum"`,
    );
  }
}
