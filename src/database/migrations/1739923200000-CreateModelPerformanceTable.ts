import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: CreateModelPerformanceTable
 * Story 13-8: Model Performance Benchmarks
 *
 * Creates the model_performance table for storing per-request AI model
 * performance data used for benchmark aggregation and router feedback.
 */
export class CreateModelPerformanceTable1739923200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'model_performance',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'request_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'task_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'success',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'quality_score',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
            default: null,
          },
          {
            name: 'latency_ms',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'input_tokens',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'output_tokens',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'cost',
            type: 'decimal',
            precision: 10,
            scale: 6,
            default: 0,
            isNullable: false,
          },
          {
            name: 'context_size',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'retry_count',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'error_type',
            type: 'varchar',
            length: '100',
            isNullable: true,
            default: null,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add indexes for efficient benchmark queries
    await queryRunner.createIndex(
      'model_performance',
      new TableIndex({
        name: 'idx_model_performance_model_task',
        columnNames: ['model', 'task_type'],
      }),
    );

    await queryRunner.createIndex(
      'model_performance',
      new TableIndex({
        name: 'idx_model_performance_workspace',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'model_performance',
      new TableIndex({
        name: 'idx_model_performance_created',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createIndex(
      'model_performance',
      new TableIndex({
        name: 'idx_model_performance_provider',
        columnNames: ['provider', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.dropIndex(
      'model_performance',
      'idx_model_performance_provider',
    );
    await queryRunner.dropIndex(
      'model_performance',
      'idx_model_performance_created',
    );
    await queryRunner.dropIndex(
      'model_performance',
      'idx_model_performance_workspace',
    );
    await queryRunner.dropIndex(
      'model_performance',
      'idx_model_performance_model_task',
    );

    // Drop the table
    await queryRunner.dropTable('model_performance');
  }
}
