import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupabaseProjectRefToProjects1738670000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN "supabase_project_ref" varchar(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "supabase_project_ref"`,
    );
  }
}
