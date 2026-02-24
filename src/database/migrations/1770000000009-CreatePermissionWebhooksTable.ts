import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePermissionWebhooksTable1770000000009 implements MigrationInterface {
  name = 'CreatePermissionWebhooksTable1770000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "permission_webhooks" (
        "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "url" VARCHAR(500) NOT NULL,
        "secret_hash" VARCHAR(255) NOT NULL,
        "event_types" TEXT DEFAULT '',
        "is_active" BOOLEAN DEFAULT true,
        "failure_count" INT DEFAULT 0,
        "last_triggered_at" TIMESTAMP WITH TIME ZONE,
        "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permission_webhooks_workspace" ON "permission_webhooks" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_permission_webhooks_workspace_active" ON "permission_webhooks" ("workspace_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_permission_webhooks_workspace_active"`);
    await queryRunner.query(`DROP INDEX "IDX_permission_webhooks_workspace"`);
    await queryRunner.query(`DROP TABLE "permission_webhooks"`);
  }
}
