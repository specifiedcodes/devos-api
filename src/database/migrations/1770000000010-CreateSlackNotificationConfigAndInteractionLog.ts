/**
 * Migration: Create Slack Notification Config and Interaction Log tables
 * Story 21.2: Slack Interactive Components (AC1)
 *
 * Creates:
 * - slack_notification_configs: Per-project, per-event notification routing
 * - slack_interaction_logs: Audit log for Slack interactive actions
 */

import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSlackNotificationConfigAndInteractionLog1770000000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create slack_notification_configs table
    await queryRunner.createTable(
      new Table({
        name: 'slack_notification_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'slack_integration_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'event_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'channel_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'is_enabled',
            type: 'boolean',
            default: true,
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

    // Unique index on (slack_integration_id, event_type, project_id) to allow per-project overrides
    await queryRunner.createIndex(
      'slack_notification_configs',
      new TableIndex({
        name: 'IDX_slack_notif_config_integration_event_project',
        columnNames: ['slack_integration_id', 'event_type', 'project_id'],
        isUnique: true,
      }),
    );

    // Index on slack_integration_id
    await queryRunner.createIndex(
      'slack_notification_configs',
      new TableIndex({
        name: 'IDX_slack_notif_config_integration',
        columnNames: ['slack_integration_id'],
      }),
    );

    // Index on project_id
    await queryRunner.createIndex(
      'slack_notification_configs',
      new TableIndex({
        name: 'IDX_slack_notif_config_project',
        columnNames: ['project_id'],
      }),
    );

    // Foreign key to slack_integrations
    await queryRunner.createForeignKey(
      'slack_notification_configs',
      new TableForeignKey({
        name: 'FK_slack_notif_config_integration',
        columnNames: ['slack_integration_id'],
        referencedTableName: 'slack_integrations',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Create slack_interaction_logs table
    await queryRunner.createTable(
      new Table({
        name: 'slack_interaction_logs',
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
            name: 'slack_integration_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'slack_user_id',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'devos_user_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'interaction_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'action_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'result_status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'result_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'response_time_ms',
            type: 'integer',
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

    // Index on (workspace_id, created_at)
    await queryRunner.createIndex(
      'slack_interaction_logs',
      new TableIndex({
        name: 'IDX_slack_interaction_log_workspace_created',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    // Index on slack_integration_id
    await queryRunner.createIndex(
      'slack_interaction_logs',
      new TableIndex({
        name: 'IDX_slack_interaction_log_integration',
        columnNames: ['slack_integration_id'],
      }),
    );

    // Foreign key to slack_integrations
    await queryRunner.createForeignKey(
      'slack_interaction_logs',
      new TableForeignKey({
        name: 'FK_slack_interaction_log_integration',
        columnNames: ['slack_integration_id'],
        referencedTableName: 'slack_integrations',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('slack_interaction_logs', true);
    await queryRunner.dropTable('slack_notification_configs', true);
  }
}
