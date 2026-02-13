import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVercelProjectIdToProjects1738660000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN "vercel_project_id" varchar(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "vercel_project_id"`,
    );
  }
}
