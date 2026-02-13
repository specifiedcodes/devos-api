import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

/**
 * Migration to create api_usage table for real-time cost tracking
 *
 * This table stores individual API usage transactions with calculated costs.
 * Differs from usage_tracking table which aggregates daily usage.
 */
export class CreateApiUsageTable1738365000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create api_usage table
    await queryRunner.createTable(
      new Table({
        name: 'api_usage',
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
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'byok_key_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'model',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'input_tokens',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'output_tokens',
            type: 'integer',
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
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add CHECK constraint for provider enum (if not exists)
    const constraintExists = await queryRunner.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'chk_api_usage_provider'
    `);

    if (!constraintExists || constraintExists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE api_usage
        ADD CONSTRAINT chk_api_usage_provider
        CHECK (provider IN ('anthropic', 'openai'))
      `);
    }

    // Create indexes for fast aggregation queries
    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_workspace_date',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_project_date',
        columnNames: ['project_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_byok_key',
        columnNames: ['byok_key_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage',
      new TableIndex({
        name: 'idx_api_usage_agent',
        columnNames: ['agent_id', 'created_at'],
      }),
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'api_usage',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'workspaces',
        onDelete: 'CASCADE',
        name: 'fk_api_usage_workspace',
      }),
    );

    await queryRunner.createForeignKey(
      'api_usage',
      new TableForeignKey({
        columnNames: ['project_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'projects',
        onDelete: 'SET NULL',
        name: 'fk_api_usage_project',
      }),
    );

    await queryRunner.createForeignKey(
      'api_usage',
      new TableForeignKey({
        columnNames: ['byok_key_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'byok_secrets',
        onDelete: 'SET NULL',
        name: 'fk_api_usage_byok_key',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    await queryRunner.dropForeignKey('api_usage', 'fk_api_usage_byok_key');
    await queryRunner.dropForeignKey('api_usage', 'fk_api_usage_project');
    await queryRunner.dropForeignKey('api_usage', 'fk_api_usage_workspace');

    // Drop table (indexes will be dropped automatically)
    await queryRunner.dropTable('api_usage');
  }
}
