import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateIpAllowlistTables1770000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create ip_allowlist_configs table
    await queryRunner.createTable(
      new Table({
        name: 'ip_allowlist_configs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'workspace_id', type: 'uuid', isUnique: true },
          { name: 'is_enabled', type: 'boolean', default: false },
          { name: 'grace_period_ends_at', type: 'timestamp', isNullable: true },
          { name: 'emergency_disable_until', type: 'timestamp', isNullable: true },
          { name: 'last_modified_by', type: 'uuid', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'ip_allowlist_configs',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 2. Create ip_allowlist_entries table
    await queryRunner.createTable(
      new Table({
        name: 'ip_allowlist_entries',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'workspace_id', type: 'uuid' },
          { name: 'ip_address', type: 'varchar', length: '45' },
          { name: 'description', type: 'varchar', length: '200' },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'created_by', type: 'uuid' },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'ip_allowlist_entries',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'ip_allowlist_entries',
      new TableForeignKey({
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createIndex(
      'ip_allowlist_entries',
      new TableIndex({ columnNames: ['workspace_id'] }),
    );

    await queryRunner.createIndex(
      'ip_allowlist_entries',
      new TableIndex({ columnNames: ['workspace_id', 'is_active'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ip_allowlist_entries', true);
    await queryRunner.dropTable('ip_allowlist_configs', true);
  }
}
