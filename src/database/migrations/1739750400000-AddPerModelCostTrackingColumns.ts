import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Migration: AddPerModelCostTrackingColumns
 * Story 13-6: Per-Model Cost Tracking
 *
 * Adds cached_tokens, task_type, and routing_reason columns to api_usage table.
 * Adds composite index on (provider, model) and index on task_type.
 */
export class AddPerModelCostTrackingColumns1739750400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add cached_tokens column (INTEGER, DEFAULT 0, NOT NULL)
    await queryRunner.addColumn(
      'api_usage',
      new TableColumn({
        name: 'cached_tokens',
        type: 'integer',
        default: 0,
        isNullable: false,
      }),
    );

    // Add task_type column (VARCHAR(50), NULLABLE)
    await queryRunner.addColumn(
      'api_usage',
      new TableColumn({
        name: 'task_type',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );

    // Add routing_reason column (VARCHAR(200), NULLABLE)
    await queryRunner.addColumn(
      'api_usage',
      new TableColumn({
        name: 'routing_reason',
        type: 'varchar',
        length: '200',
        isNullable: true,
      }),
    );

    // Add composite index on (provider, model) for cost breakdown queries
    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_provider_model',
        columnNames: ['provider', 'model'],
      }),
    );

    // Add index on task_type for task type aggregation queries
    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_task_type',
        columnNames: ['task_type'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex('api_usage', 'idx_api_usage_task_type');
    await queryRunner.dropIndex('api_usage', 'idx_api_usage_provider_model');

    // Drop columns
    await queryRunner.dropColumn('api_usage', 'routing_reason');
    await queryRunner.dropColumn('api_usage', 'task_type');
    await queryRunner.dropColumn('api_usage', 'cached_tokens');
  }
}
