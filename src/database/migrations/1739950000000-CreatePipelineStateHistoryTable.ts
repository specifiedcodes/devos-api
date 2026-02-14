import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: CreatePipelineStateHistoryTable
 * Story 11.1: Orchestrator State Machine Core
 *
 * Creates the pipeline_state_history table for auditing pipeline state transitions.
 */
export class CreatePipelineStateHistoryTable1739950000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create pipeline_state_enum type
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_state_enum') THEN
          CREATE TYPE pipeline_state_enum AS ENUM (
            'idle', 'planning', 'implementing', 'qa', 'deploying', 'complete', 'failed', 'paused'
          );
        END IF;
      END$$;
    `);

    // Create pipeline_state_history table
    await queryRunner.createTable(
      new Table({
        name: 'pipeline_state_history',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workflow_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'previous_state',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'new_state',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'triggered_by',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'story_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            default: "'{}'",
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // Create composite index: (project_id, created_at)
    await queryRunner.createIndex(
      'pipeline_state_history',
      new TableIndex({
        name: 'IDX_pipeline_state_history_project_created',
        columnNames: ['project_id', 'created_at'],
      }),
    );

    // Create composite index: (workspace_id, created_at)
    await queryRunner.createIndex(
      'pipeline_state_history',
      new TableIndex({
        name: 'IDX_pipeline_state_history_workspace_created',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    // Create index on workflow_id
    await queryRunner.createIndex(
      'pipeline_state_history',
      new TableIndex({
        name: 'IDX_pipeline_state_history_workflow',
        columnNames: ['workflow_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('pipeline_state_history', true);

    await queryRunner.query(`
      DROP TYPE IF EXISTS pipeline_state_enum;
    `);
  }
}
