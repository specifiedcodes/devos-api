import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContextSnapshotsTable1738420000000 implements MigrationInterface {
  name = 'CreateContextSnapshotsTable1738420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (idempotent)
    const tableExists = await queryRunner.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'context_snapshots')`,
    );

    if (tableExists[0]?.exists) {
      return;
    }

    // Create enum type for context tier (check existence for idempotency)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."context_tier_enum" AS ENUM('tier_1_active', 'tier_2_recent', 'tier_3_archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    // Create context_snapshots table
    await queryRunner.query(`
      CREATE TABLE "context_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "agent_id" uuid NOT NULL,
        "workspace_id" uuid NOT NULL,
        "tier" "public"."context_tier_enum" NOT NULL,
        "context_data" jsonb,
        "size_bytes" integer NOT NULL,
        "version" integer NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_context_snapshots" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for efficient queries
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_context_snapshots_agent_version" ON "context_snapshots" ("agent_id", "version" DESC)`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_context_snapshots_workspace_agent" ON "context_snapshots" ("workspace_id", "agent_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_context_snapshots_tier_created" ON "context_snapshots" ("tier", "created_at")`,
    );

    // Create foreign key constraints with CASCADE on delete
    await queryRunner.query(`
      ALTER TABLE "context_snapshots"
        ADD CONSTRAINT "FK_context_snapshots_agent_id"
        FOREIGN KEY ("agent_id") REFERENCES "agents"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "context_snapshots"
        ADD CONSTRAINT "FK_context_snapshots_workspace_id"
        FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "context_snapshots"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."context_tier_enum"`,
    );
  }
}
