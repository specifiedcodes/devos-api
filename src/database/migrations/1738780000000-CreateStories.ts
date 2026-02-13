import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStories1738780000000 implements MigrationInterface {
  name = 'CreateStories1738780000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "story_status_enum" AS ENUM ('backlog', 'in_progress', 'review', 'done')
    `);

    await queryRunner.query(`
      CREATE TYPE "story_priority_enum" AS ENUM ('high', 'medium', 'low')
    `);

    await queryRunner.query(`
      CREATE TABLE "stories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "epic_id" uuid,
        "story_key" varchar(20) NOT NULL,
        "title" varchar(255) NOT NULL,
        "description" text,
        "status" "story_status_enum" NOT NULL DEFAULT 'backlog',
        "priority" "story_priority_enum" NOT NULL DEFAULT 'medium',
        "story_points" integer,
        "position" integer NOT NULL DEFAULT 0,
        "tags" text,
        "assigned_agent_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stories_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stories_agent" FOREIGN KEY ("assigned_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_stories_project_status" ON "stories" ("project_id", "status")`);
    await queryRunner.query(`CREATE INDEX "IDX_stories_project_epic" ON "stories" ("project_id", "epic_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_stories_assigned_agent" ON "stories" ("assigned_agent_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_stories_assigned_agent"`);
    await queryRunner.query(`DROP INDEX "IDX_stories_project_epic"`);
    await queryRunner.query(`DROP INDEX "IDX_stories_project_status"`);
    await queryRunner.query(`DROP TABLE "stories"`);
    await queryRunner.query(`DROP TYPE "story_priority_enum"`);
    await queryRunner.query(`DROP TYPE "story_status_enum"`);
  }
}
