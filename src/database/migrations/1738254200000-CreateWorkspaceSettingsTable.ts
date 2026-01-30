import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWorkspaceSettingsTable1738254200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'workspace_settings',
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
            isUnique: true,
          },
          {
            name: 'workspace_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'default_deployment_platform',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'project_preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'notification_preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'branding',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Foreign key to workspaces table
    await queryRunner.query(`
      ALTER TABLE workspace_settings
      ADD CONSTRAINT fk_workspace_settings_workspace
      FOREIGN KEY (workspace_id)
      REFERENCES workspaces(id)
      ON DELETE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('workspace_settings');
  }
}
