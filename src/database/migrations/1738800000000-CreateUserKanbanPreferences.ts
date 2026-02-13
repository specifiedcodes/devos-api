import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserKanbanPreferences1738800000000 implements MigrationInterface {
  name = 'CreateUserKanbanPreferences1738800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_kanban_preferences table
    await queryRunner.query(`
      CREATE TABLE "user_kanban_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "project_id" uuid,
        "column_config" jsonb NOT NULL DEFAULT '[{"status":"backlog","visible":true,"displayName":"Backlog","order":0},{"status":"in_progress","visible":true,"displayName":"In Progress","order":1},{"status":"review","visible":true,"displayName":"Review","order":2},{"status":"done","visible":true,"displayName":"Done","order":3}]'::jsonb,
        "card_display_config" jsonb NOT NULL DEFAULT '{"showStoryPoints":true,"showTags":true,"showDates":false,"showPriority":true,"showEpic":true,"showAssignedAgent":true}'::jsonb,
        "theme" character varying(10) NOT NULL DEFAULT 'system',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_kanban_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_kanban_preferences_user_project" UNIQUE ("user_id", "project_id"),
        CONSTRAINT "FK_user_kanban_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_user_kanban_preferences_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Create indexes for user_kanban_preferences table
    await queryRunner.query(
      `CREATE INDEX "IDX_user_kanban_preferences_user" ON "user_kanban_preferences" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_kanban_preferences_project" ON "user_kanban_preferences" ("project_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_user_kanban_preferences_project"`);
    await queryRunner.query(`DROP INDEX "IDX_user_kanban_preferences_user"`);

    // Drop table
    await queryRunner.query(`DROP TABLE "user_kanban_preferences"`);
  }
}
