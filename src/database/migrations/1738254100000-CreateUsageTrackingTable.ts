import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUsageTrackingTable1738254100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'usage_tracking',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'request_count',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'input_tokens',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'output_tokens',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'cost_usd',
            type: 'decimal',
            precision: 10,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'date',
            type: 'date',
            isNullable: false,
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

    // Create composite index for workspace_id + date (most common query)
    await queryRunner.createIndex(
      'usage_tracking',
      new TableIndex({
        name: 'IDX_usage_tracking_workspace_date',
        columnNames: ['workspace_id', 'date'],
      }),
    );

    // Create composite index for workspace_id + project_id + date
    await queryRunner.createIndex(
      'usage_tracking',
      new TableIndex({
        name: 'IDX_usage_tracking_workspace_project_date',
        columnNames: ['workspace_id', 'project_id', 'date'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('usage_tracking');
  }
}
