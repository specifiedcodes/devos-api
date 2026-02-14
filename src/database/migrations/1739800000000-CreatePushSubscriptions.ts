import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Migration: Create Push Subscriptions Table
 * Story 10.4: Push Notifications Setup
 *
 * Creates table for storing Web Push API subscriptions per user/device.
 */
export class CreatePushSubscriptions1739800000000 implements MigrationInterface {
  name = 'CreatePushSubscriptions1739800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create push_subscriptions table
    await queryRunner.createTable(
      new Table({
        name: 'push_subscriptions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'endpoint',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'keys',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'user_agent',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'device_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'IDX_push_subscriptions_user_workspace',
        columnNames: ['user_id', 'workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'IDX_push_subscriptions_workspace',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'IDX_push_subscriptions_last_used',
        columnNames: ['last_used_at'],
      }),
    );

    await queryRunner.createIndex(
      'push_subscriptions',
      new TableIndex({
        name: 'IDX_push_subscriptions_endpoint',
        columnNames: ['endpoint'],
        isUnique: true,
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'push_subscriptions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        name: 'FK_push_subscriptions_user',
      }),
    );

    await queryRunner.createForeignKey(
      'push_subscriptions',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'workspaces',
        onDelete: 'CASCADE',
        name: 'FK_push_subscriptions_workspace',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('push_subscriptions', 'FK_push_subscriptions_user');
    await queryRunner.dropForeignKey('push_subscriptions', 'FK_push_subscriptions_workspace');

    // Drop indexes
    await queryRunner.dropIndex('push_subscriptions', 'IDX_push_subscriptions_user_workspace');
    await queryRunner.dropIndex('push_subscriptions', 'IDX_push_subscriptions_workspace');
    await queryRunner.dropIndex('push_subscriptions', 'IDX_push_subscriptions_last_used');
    await queryRunner.dropIndex('push_subscriptions', 'IDX_push_subscriptions_endpoint');

    // Drop table
    await queryRunner.dropTable('push_subscriptions');
  }
}
