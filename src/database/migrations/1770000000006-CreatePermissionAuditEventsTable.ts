import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePermissionAuditEventsTable1770000000006
  implements MigrationInterface
{
  name = 'CreatePermissionAuditEventsTable1770000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "permission_audit_events" (
        "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "event_type" VARCHAR(50) NOT NULL,
        "actor_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "target_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "target_role_id" UUID,
        "before_state" JSONB,
        "after_state" JSONB,
        "ip_address" VARCHAR(45),
        "user_agent" VARCHAR(500),
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pae_workspace_created" ON "permission_audit_events" ("workspace_id", "created_at" DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pae_workspace_event_type" ON "permission_audit_events" ("workspace_id", "event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pae_workspace_actor" ON "permission_audit_events" ("workspace_id", "actor_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pae_workspace_target_user" ON "permission_audit_events" ("workspace_id", "target_user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pae_workspace_target_role" ON "permission_audit_events" ("workspace_id", "target_role_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_pae_workspace_target_role"`);
    await queryRunner.query(`DROP INDEX "IDX_pae_workspace_target_user"`);
    await queryRunner.query(`DROP INDEX "IDX_pae_workspace_actor"`);
    await queryRunner.query(`DROP INDEX "IDX_pae_workspace_event_type"`);
    await queryRunner.query(`DROP INDEX "IDX_pae_workspace_created"`);
    await queryRunner.query(`DROP TABLE "permission_audit_events"`);
  }
}
