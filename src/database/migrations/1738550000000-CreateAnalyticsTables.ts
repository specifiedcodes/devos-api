import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateAnalyticsTables1738550000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create analytics_events table
    await queryRunner.createTable(
      new Table({
        name: 'analytics_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
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
            name: 'event_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'event_data',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'timestamp',
            type: 'timestamptz',
            isNullable: false,
            default: 'NOW()',
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // Create indexes for analytics_events
    await queryRunner.createIndex(
      'analytics_events',
      new TableIndex({
        name: 'idx_analytics_events_user',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'analytics_events',
      new TableIndex({
        name: 'idx_analytics_events_workspace',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'analytics_events',
      new TableIndex({
        name: 'idx_analytics_events_type',
        columnNames: ['event_type'],
      }),
    );

    await queryRunner.createIndex(
      'analytics_events',
      new TableIndex({
        name: 'idx_analytics_events_timestamp',
        columnNames: ['timestamp'],
      }),
    );

    // Create composite index for common query patterns
    // This index optimizes deduplication queries (user_id + event_type + timestamp range)
    // and supports efficient funnel analytics queries
    await queryRunner.createIndex(
      'analytics_events',
      new TableIndex({
        name: 'idx_analytics_events_user_type_timestamp',
        columnNames: ['user_id', 'event_type', 'timestamp'],
      }),
    );

    // Foreign key to users table
    await queryRunner.createForeignKey(
      'analytics_events',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to workspaces table
    await queryRunner.createForeignKey(
      'analytics_events',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create analytics_aggregates table
    await queryRunner.createTable(
      new Table({
        name: 'analytics_aggregates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'metric_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'metric_value',
            type: 'numeric',
            isNullable: false,
          },
          {
            name: 'dimension',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'aggregation_period',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'period_start',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'period_end',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // Create index for analytics_aggregates
    await queryRunner.createIndex(
      'analytics_aggregates',
      new TableIndex({
        name: 'idx_analytics_aggregates_metric',
        columnNames: ['metric_name', 'period_start'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop analytics_aggregates table
    await queryRunner.dropTable('analytics_aggregates', true);

    // Drop analytics_events table with foreign keys
    const table = await queryRunner.getTable('analytics_events');
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('analytics_events', foreignKey);
      }
    }

    await queryRunner.dropTable('analytics_events', true);
  }
}
