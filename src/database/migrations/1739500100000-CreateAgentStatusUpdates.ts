import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Migration: Create Agent Status Updates Table
 * Story 9.3: Agent Status Updates
 *
 * Creates the agent_status_updates table for tracking status history.
 */
export class CreateAgentStatusUpdates1739500100000 implements MigrationInterface {
  name = 'CreateAgentStatusUpdates1739500100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the agent_status_updates table
    await queryRunner.createTable(
      new Table({
        name: 'agent_status_updates',
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
            isNullable: false,
          },
          {
            name: 'agent_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'agent_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'previous_status',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'new_status',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'posted_to_chat',
            type: 'boolean',
            default: false,
          },
          {
            name: 'chat_message_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for efficient queries
    // Index on workspace_id for workspace-scoped queries
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    // Index on agent_id for agent-scoped queries
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_agent_id',
        columnNames: ['agent_id'],
      }),
    );

    // Composite index for history queries (agent_id, created_at DESC)
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_agent_created',
        columnNames: ['agent_id', 'created_at'],
      }),
    );

    // Composite index for workspace history queries (workspace_id, created_at DESC)
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_workspace_created',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    // Composite index for workspace + agent queries
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_workspace_agent_created',
        columnNames: ['workspace_id', 'agent_id', 'created_at'],
      }),
    );

    // Index on category for filtered queries
    await queryRunner.createIndex(
      'agent_status_updates',
      new TableIndex({
        name: 'IDX_agent_status_updates_category',
        columnNames: ['category'],
      }),
    );

    // Foreign key to workspaces
    await queryRunner.createForeignKey(
      'agent_status_updates',
      new TableForeignKey({
        name: 'FK_agent_status_updates_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to projects (nullable)
    await queryRunner.createForeignKey(
      'agent_status_updates',
      new TableForeignKey({
        name: 'FK_agent_status_updates_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to agents
    await queryRunner.createForeignKey(
      'agent_status_updates',
      new TableForeignKey({
        name: 'FK_agent_status_updates_agent',
        columnNames: ['agent_id'],
        referencedTableName: 'agents',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to chat_messages (nullable)
    await queryRunner.createForeignKey(
      'agent_status_updates',
      new TableForeignKey({
        name: 'FK_agent_status_updates_chat_message',
        columnNames: ['chat_message_id'],
        referencedTableName: 'chat_messages',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('agent_status_updates', 'FK_agent_status_updates_chat_message');
    await queryRunner.dropForeignKey('agent_status_updates', 'FK_agent_status_updates_agent');
    await queryRunner.dropForeignKey('agent_status_updates', 'FK_agent_status_updates_project');
    await queryRunner.dropForeignKey('agent_status_updates', 'FK_agent_status_updates_workspace');

    // Drop indexes
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_category');
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_workspace_agent_created');
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_workspace_created');
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_agent_created');
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_agent_id');
    await queryRunner.dropIndex('agent_status_updates', 'IDX_agent_status_updates_workspace_id');

    // Drop table
    await queryRunner.dropTable('agent_status_updates');
  }
}
