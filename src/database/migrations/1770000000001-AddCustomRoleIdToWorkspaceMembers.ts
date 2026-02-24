import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddCustomRoleIdToWorkspaceMembers1770000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add custom_role_id column
    await queryRunner.addColumn(
      'workspace_members',
      new TableColumn({
        name: 'custom_role_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Index on custom_role_id
    await queryRunner.createIndex(
      'workspace_members',
      new TableIndex({
        name: 'IDX_workspace_members_custom_role_id',
        columnNames: ['custom_role_id'],
      }),
    );

    // FK: custom_role_id -> custom_roles(id) SET NULL
    await queryRunner.createForeignKey(
      'workspace_members',
      new TableForeignKey({
        name: 'FK_workspace_members_custom_role',
        columnNames: ['custom_role_id'],
        referencedTableName: 'custom_roles',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('workspace_members', 'FK_workspace_members_custom_role');
    await queryRunner.dropIndex('workspace_members', 'IDX_workspace_members_custom_role_id');
    await queryRunner.dropColumn('workspace_members', 'custom_role_id');
  }
}
