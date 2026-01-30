import { MigrationInterface, QueryRunner, TableColumn, Table } from 'typeorm';

export class AddAccountDeletion1738266000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add deleted_at column to users table for soft delete
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'deleted_at',
        type: 'timestamp',
        isNullable: true,
        default: null,
      }),
    );

    // Create account_deletions table for tracking deletion schedule
    await queryRunner.createTable(
      new Table({
        name: 'account_deletions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'hard_delete_scheduled_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'completed',
            type: 'boolean',
            default: false,
          },
          {
            name: 'deletion_reason',
            type: 'text',
            isNullable: true,
          },
        ],
        indices: [
          {
            name: 'IDX_account_deletions_user_id',
            columnNames: ['user_id'],
          },
          {
            name: 'IDX_account_deletions_scheduled_at',
            columnNames: ['hard_delete_scheduled_at'],
          },
          {
            name: 'IDX_account_deletions_completed',
            columnNames: ['completed'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop account_deletions table
    await queryRunner.dropTable('account_deletions', true);

    // Remove deleted_at column from users table
    await queryRunner.dropColumn('users', 'deleted_at');
  }
}
