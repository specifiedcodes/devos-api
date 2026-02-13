import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration to add type and tags columns to workspaces table
 *
 * These columns were defined in the entity but missing from the database schema
 */
export class AddTypeAndTagsToWorkspaces1738500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add type column
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'type',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );

    // Add tags column
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'tags',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('workspaces', 'tags');
    await queryRunner.dropColumn('workspaces', 'type');
  }
}
