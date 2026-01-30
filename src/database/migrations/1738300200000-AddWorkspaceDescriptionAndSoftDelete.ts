import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkspaceDescriptionAndSoftDelete1738300200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add description column
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'description',
        type: 'text',
        isNullable: true,
      }),
    );

    // Add deleted_at column for soft deletes
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'deleted_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('workspaces', 'deleted_at');
    await queryRunner.dropColumn('workspaces', 'description');
  }
}
