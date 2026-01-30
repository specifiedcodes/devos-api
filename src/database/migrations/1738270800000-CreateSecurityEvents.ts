import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSecurityEvents1738270800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'security_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'email',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'event_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'reason',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for common queries
    await queryRunner.createIndex(
      'security_events',
      new TableIndex({
        name: 'IDX_SECURITY_EVENTS_USER_EVENT',
        columnNames: ['user_id', 'event_type'],
      }),
    );

    await queryRunner.createIndex(
      'security_events',
      new TableIndex({
        name: 'IDX_SECURITY_EVENTS_CREATED_AT',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'security_events',
      new TableIndex({
        name: 'IDX_SECURITY_EVENTS_IP',
        columnNames: ['ip_address'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('security_events', 'IDX_SECURITY_EVENTS_IP');
    await queryRunner.dropIndex(
      'security_events',
      'IDX_SECURITY_EVENTS_CREATED_AT',
    );
    await queryRunner.dropIndex(
      'security_events',
      'IDX_SECURITY_EVENTS_USER_EVENT',
    );
    await queryRunner.dropTable('security_events');
  }
}
