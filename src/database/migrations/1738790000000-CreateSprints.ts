import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSprints1738790000000 implements MigrationInterface {
  name = 'CreateSprints1738790000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create sprint_status_enum type
    await queryRunner.query(
      `CREATE TYPE "sprint_status_enum" AS ENUM('planned', 'active', 'completed')`,
    );

    // Create sprints table
    await queryRunner.query(`
      CREATE TABLE "sprints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "sprint_number" integer NOT NULL,
        "name" character varying(100) NOT NULL,
        "goal" text,
        "start_date" date,
        "end_date" date,
        "capacity" integer,
        "status" "sprint_status_enum" NOT NULL DEFAULT 'planned',
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sprints" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sprints_project" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Create indexes for sprints table
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_sprints_project_number" ON "sprints" ("project_id", "sprint_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sprints_project_status" ON "sprints" ("project_id", "status")`,
    );

    // Add sprint_id column to stories table
    await queryRunner.query(
      `ALTER TABLE "stories" ADD "sprint_id" uuid`,
    );

    // Add foreign key constraint for sprint_id
    await queryRunner.query(
      `ALTER TABLE "stories" ADD CONSTRAINT "FK_stories_sprint" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // Create index on stories.sprint_id
    await queryRunner.query(
      `CREATE INDEX "IDX_stories_sprint" ON "stories" ("sprint_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop stories sprint_id FK and column
    await queryRunner.query(
      `ALTER TABLE "stories" DROP CONSTRAINT "FK_stories_sprint"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_stories_sprint"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stories" DROP COLUMN "sprint_id"`,
    );

    // Drop sprints table
    await queryRunner.query(`DROP INDEX "IDX_sprints_project_status"`);
    await queryRunner.query(`DROP INDEX "IDX_sprints_project_number"`);
    await queryRunner.query(`DROP TABLE "sprints"`);

    // Drop enum
    await queryRunner.query(`DROP TYPE "sprint_status_enum"`);
  }
}
