/**
 * Migration: Create Installation Logs Table
 *
 * Story 18-8: Agent Installation Flow
 *
 * Creates table for tracking agent installation progress and history.
 */
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateInstallationLogsTable1742000000000 implements MigrationInterface {
  name = 'CreateInstallationLogsTable1742000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE installation_status AS ENUM (
        'pending',
        'validating',
        'downloading',
        'resolving_dependencies',
        'installing',
        'configuring',
        'completed',
        'failed',
        'rolled_back'
      );
    `);

    await queryRunner.query(`
      CREATE TYPE installation_step AS ENUM (
        'pre_check',
        'validate_permissions',
        'check_dependencies',
        'check_conflicts',
        'copy_definition',
        'install_dependencies',
        'configure_agent',
        'verify_installation',
        'complete'
      );
    `);

    await queryRunner.createTable(
      new Table({
        name: 'installation_logs',
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
            name: 'marketplace_agent_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'initiated_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'target_version',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'installation_status',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'current_step',
            type: 'installation_step',
            isNullable: true,
          },
          {
            name: 'progress_percentage',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'steps',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'installed_agent_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'completed_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'installation_logs',
      new TableIndex({
        name: 'IDX_installation_logs_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'installation_logs',
      new TableIndex({
        name: 'IDX_installation_logs_marketplace_agent_id',
        columnNames: ['marketplace_agent_id'],
      }),
    );

    await queryRunner.createIndex(
      'installation_logs',
      new TableIndex({
        name: 'IDX_installation_logs_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'installation_logs',
      new TableIndex({
        name: 'IDX_installation_logs_started_at',
        columnNames: ['started_at'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'installation_logs',
      new TableForeignKey({
        name: 'FK_installation_logs_workspace_id',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'installation_logs',
      new TableForeignKey({
        name: 'FK_installation_logs_marketplace_agent_id',
        columnNames: ['marketplace_agent_id'],
        referencedTableName: 'marketplace_agents',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'installation_logs',
      new TableForeignKey({
        name: 'FK_installation_logs_initiated_by',
        columnNames: ['initiated_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('installation_logs', 'FK_installation_logs_initiated_by');
    await queryRunner.dropForeignKey('installation_logs', 'FK_installation_logs_marketplace_agent_id');
    await queryRunner.dropForeignKey('installation_logs', 'FK_installation_logs_workspace_id');
    await queryRunner.dropIndex('installation_logs', 'IDX_installation_logs_started_at');
    await queryRunner.dropIndex('installation_logs', 'IDX_installation_logs_status');
    await queryRunner.dropIndex('installation_logs', 'IDX_installation_logs_marketplace_agent_id');
    await queryRunner.dropIndex('installation_logs', 'IDX_installation_logs_workspace_id');
    await queryRunner.dropTable('installation_logs');
    await queryRunner.query(`DROP TYPE installation_step;`);
    await queryRunner.query(`DROP TYPE installation_status;`);
  }
}
