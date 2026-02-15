import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: CreateModelDefinitions
 * Story 13-2: Model Registry
 *
 * Creates the model_definitions table for AI model catalog.
 */
export class CreateModelDefinitions1739960000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'model_definitions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'model_id',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'context_window',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'max_output_tokens',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'supports_tools',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'supports_vision',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'supports_streaming',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'supports_embedding',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'input_price_per_1m',
            type: 'decimal',
            precision: 10,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'output_price_per_1m',
            type: 'decimal',
            precision: 10,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'cached_input_price_per_1m',
            type: 'decimal',
            precision: 10,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'avg_latency_ms',
            type: 'integer',
            default: 0,
            isNullable: false,
          },
          {
            name: 'quality_tier',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'suitable_for',
            type: 'jsonb',
            default: "'[]'",
            isNullable: false,
          },
          {
            name: 'available',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'deprecation_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'model_definitions',
      new TableIndex({
        name: 'idx_model_definitions_provider',
        columnNames: ['provider'],
      }),
    );

    await queryRunner.createIndex(
      'model_definitions',
      new TableIndex({
        name: 'idx_model_definitions_quality_tier',
        columnNames: ['quality_tier'],
      }),
    );

    await queryRunner.createIndex(
      'model_definitions',
      new TableIndex({
        name: 'idx_model_definitions_available',
        columnNames: ['available'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('model_definitions', true);
  }
}
