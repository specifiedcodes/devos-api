/**
 * Migration: Add Agent Sandbox Tables
 *
 * Story 18-3: Agent Sandbox Testing
 *
 * Creates tables for:
 * - agent_sandbox_sessions: Isolated testing sessions for custom agents
 * - agent_sandbox_tool_calls: Individual tool call records during sessions
 * - agent_test_scenarios: Pre-built and custom test scenarios
 */

import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddAgentSandboxTables1740000000000 implements MigrationInterface {
  name = 'AddAgentSandboxTables1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create agent_sandbox_sessions table
    await queryRunner.createTable(
      new Table({
        name: 'agent_sandbox_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'agent_definition_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'test_scenario_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'sample_project',
            type: 'enum',
            enum: ['nextjs', 'express', 'python', 'react', 'custom'],
            default: "'nextjs'",
          },
          {
            name: 'timeout_minutes',
            type: 'int',
            default: 10,
          },
          {
            name: 'max_tool_calls',
            type: 'int',
            default: 50,
          },
          {
            name: 'max_tokens',
            type: 'int',
            default: 100000,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'started_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'tokens_input',
            type: 'int',
            default: 0,
          },
          {
            name: 'tokens_output',
            type: 'int',
            default: 0,
          },
          {
            name: 'tool_calls_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'estimated_cost_cents',
            type: 'int',
            default: 0,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'sandbox_config',
            type: 'jsonb',
            default: "'{}'::jsonb",
          },
          {
            name: 'test_inputs',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'test_outputs',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for agent_sandbox_sessions
    await queryRunner.createIndex(
      'agent_sandbox_sessions',
      new TableIndex({
        name: 'IDX_agent_sandbox_sessions_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_sessions',
      new TableIndex({
        name: 'IDX_agent_sandbox_sessions_agent_definition_id',
        columnNames: ['agent_definition_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_sessions',
      new TableIndex({
        name: 'IDX_agent_sandbox_sessions_user_id',
        columnNames: ['user_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_sessions',
      new TableIndex({
        name: 'IDX_agent_sandbox_sessions_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_sessions',
      new TableIndex({
        name: 'IDX_agent_sandbox_sessions_expires_at',
        columnNames: ['expires_at'],
      }),
    );

    // Create foreign keys for agent_sandbox_sessions
    await queryRunner.createForeignKey(
      'agent_sandbox_sessions',
      new TableForeignKey({
        name: 'FK_agent_sandbox_sessions_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'agent_sandbox_sessions',
      new TableForeignKey({
        name: 'FK_agent_sandbox_sessions_agent_definition',
        columnNames: ['agent_definition_id'],
        referencedTableName: 'agent_definitions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'agent_sandbox_sessions',
      new TableForeignKey({
        name: 'FK_agent_sandbox_sessions_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create agent_sandbox_tool_calls table
    await queryRunner.createTable(
      new Table({
        name: 'agent_sandbox_tool_calls',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'sandbox_session_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'tool_category',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'tool_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'tool_input',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'tool_output',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'executing', 'success', 'denied', 'error'],
            default: "'pending'",
          },
          {
            name: 'denial_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'duration_ms',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for agent_sandbox_tool_calls
    await queryRunner.createIndex(
      'agent_sandbox_tool_calls',
      new TableIndex({
        name: 'IDX_agent_sandbox_tool_calls_sandbox_session_id',
        columnNames: ['sandbox_session_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_tool_calls',
      new TableIndex({
        name: 'IDX_agent_sandbox_tool_calls_tool_category',
        columnNames: ['tool_category'],
      }),
    );
    await queryRunner.createIndex(
      'agent_sandbox_tool_calls',
      new TableIndex({
        name: 'IDX_agent_sandbox_tool_calls_status',
        columnNames: ['status'],
      }),
    );

    // Create foreign key for agent_sandbox_tool_calls
    await queryRunner.createForeignKey(
      'agent_sandbox_tool_calls',
      new TableForeignKey({
        name: 'FK_agent_sandbox_tool_calls_sandbox_session',
        columnNames: ['sandbox_session_id'],
        referencedTableName: 'agent_sandbox_sessions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create agent_test_scenarios table
    await queryRunner.createTable(
      new Table({
        name: 'agent_test_scenarios',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'agent_definition_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['development', 'qa', 'devops', 'documentation', 'productivity', 'security', 'custom'],
            isNullable: true,
          },
          {
            name: 'is_built_in',
            type: 'boolean',
            default: false,
          },
          {
            name: 'sample_input',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'expected_behavior',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'setup_script',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'validation_script',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes for agent_test_scenarios
    await queryRunner.createIndex(
      'agent_test_scenarios',
      new TableIndex({
        name: 'IDX_agent_test_scenarios_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_test_scenarios',
      new TableIndex({
        name: 'IDX_agent_test_scenarios_agent_definition_id',
        columnNames: ['agent_definition_id'],
      }),
    );
    await queryRunner.createIndex(
      'agent_test_scenarios',
      new TableIndex({
        name: 'IDX_agent_test_scenarios_category',
        columnNames: ['category'],
      }),
    );
    await queryRunner.createIndex(
      'agent_test_scenarios',
      new TableIndex({
        name: 'IDX_agent_test_scenarios_is_built_in',
        columnNames: ['is_built_in'],
      }),
    );

    // Create foreign keys for agent_test_scenarios
    await queryRunner.createForeignKey(
      'agent_test_scenarios',
      new TableForeignKey({
        name: 'FK_agent_test_scenarios_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createForeignKey(
      'agent_test_scenarios',
      new TableForeignKey({
        name: 'FK_agent_test_scenarios_agent_definition',
        columnNames: ['agent_definition_id'],
        referencedTableName: 'agent_definitions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
    await queryRunner.createForeignKey(
      'agent_test_scenarios',
      new TableForeignKey({
        name: 'FK_agent_test_scenarios_creator',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop agent_test_scenarios table
    await queryRunner.dropTable('agent_test_scenarios', true);

    // Drop agent_sandbox_tool_calls table
    await queryRunner.dropTable('agent_sandbox_tool_calls', true);

    // Drop agent_sandbox_sessions table
    await queryRunner.dropTable('agent_sandbox_sessions', true);
  }
}
