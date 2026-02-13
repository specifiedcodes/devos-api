import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRailwayProjectIdToProjects1738570000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" ADD COLUMN "railway_project_id" varchar(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" DROP COLUMN "railway_project_id"`,
    );
  }
}
