import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkspaceAgencyFields1738254300000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add last_accessed_at column for workspace switching optimization
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'last_accessed_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Add is_favorite column for quick access to favorite workspaces
    await queryRunner.addColumn(
      'workspaces',
      new TableColumn({
        name: 'is_favorite',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('workspaces', 'last_accessed_at');
    await queryRunner.dropColumn('workspaces', 'is_favorite');
  }
}
