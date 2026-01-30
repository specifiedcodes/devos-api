import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddCurrentWorkspaceToUser1738300400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add current_workspace_id column
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'current_workspace_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Add index for performance
    await queryRunner.query(
      'CREATE INDEX "idx_users_current_workspace_id" ON "users" ("current_workspace_id")',
    );

    // Add foreign key to workspaces table
    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        columnNames: ['current_workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL', // If workspace deleted, set to null
      }),
    );

    // Backfill existing users with their first workspace
    await queryRunner.query(`
      UPDATE users u
      SET current_workspace_id = (
        SELECT wm.workspace_id
        FROM workspace_members wm
        WHERE wm.user_id = u.id
        ORDER BY wm.created_at ASC
        LIMIT 1
      )
      WHERE u.current_workspace_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('current_workspace_id') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('users', foreignKey);
    }

    await queryRunner.query('DROP INDEX IF EXISTS "idx_users_current_workspace_id"');
    await queryRunner.dropColumn('users', 'current_workspace_id');
  }
}
