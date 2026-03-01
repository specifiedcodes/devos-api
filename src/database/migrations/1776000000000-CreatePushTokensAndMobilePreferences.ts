import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class CreatePushTokensAndMobilePreferences1776000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'push_tokens',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'workspace_id', type: 'uuid', isNullable: false },
          { name: 'device_id', type: 'varchar', length: '255', isNullable: false },
          { name: 'push_token', type: 'varchar', length: '255', isNullable: false },
          { name: 'platform', type: 'varchar', length: '10', isNullable: false },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'last_used_at', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['workspace_id'],
            referencedTableName: 'workspaces',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('push_tokens', new TableIndex({ name: 'IDX_push_tokens_user_id', columnNames: ['user_id'] }));
    await queryRunner.createIndex('push_tokens', new TableIndex({ name: 'IDX_push_tokens_push_token', columnNames: ['push_token'] }));
    await queryRunner.createIndex('push_tokens', new TableIndex({ name: 'IDX_push_tokens_user_workspace', columnNames: ['user_id', 'workspace_id'] }));
    await queryRunner.createUniqueConstraint('push_tokens', new TableUnique({ name: 'UQ_push_tokens_device_user', columnNames: ['device_id', 'user_id'] }));

    await queryRunner.createTable(
      new Table({
        name: 'mobile_notification_preferences',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'workspace_id', type: 'uuid', isNullable: false },
          { name: 'quiet_hours_start', type: 'time', isNullable: true },
          { name: 'quiet_hours_end', type: 'time', isNullable: true },
          { name: 'categories_enabled', type: 'text', default: `'agent,deployment,cost,sprint'` },
          { name: 'urgent_only_in_quiet', type: 'boolean', default: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['workspace_id'],
            referencedTableName: 'workspaces',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('mobile_notification_preferences', new TableIndex({ name: 'IDX_mobile_prefs_user_workspace', columnNames: ['user_id', 'workspace_id'] }));
    await queryRunner.createUniqueConstraint('mobile_notification_preferences', new TableUnique({ name: 'UQ_mobile_prefs_user_workspace', columnNames: ['user_id', 'workspace_id'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mobile_notification_preferences');
    await queryRunner.dropTable('push_tokens');
  }
}
