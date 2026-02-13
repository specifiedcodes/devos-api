import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateOnboardingStatus1738540000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create onboarding_status table
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_status',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['not_started', 'in_progress', 'completed'],
            default: "'not_started'",
            isNullable: false,
          },
          {
            name: 'account_created',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'github_connected',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'deployment_configured',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'database_configured',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'ai_key_added',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'first_project_created',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'tutorial_completed',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'current_step',
            type: 'varchar',
            length: '50',
            default: "'service_connections'",
            isNullable: false,
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create unique index on (user_id, workspace_id) - one onboarding record per user per workspace
    await queryRunner.createIndex(
      'onboarding_status',
      new TableIndex({
        name: 'idx_onboarding_status_user_workspace_unique',
        columnNames: ['user_id', 'workspace_id'],
        isUnique: true,
      }),
    );

    // Create index on user_id for faster lookups
    await queryRunner.createIndex(
      'onboarding_status',
      new TableIndex({
        name: 'idx_onboarding_status_user_id',
        columnNames: ['user_id'],
      }),
    );

    // Create index on workspace_id for faster lookups
    await queryRunner.createIndex(
      'onboarding_status',
      new TableIndex({
        name: 'idx_onboarding_status_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    // Foreign key to users table
    await queryRunner.createForeignKey(
      'onboarding_status',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to workspaces table
    await queryRunner.createForeignKey(
      'onboarding_status',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('onboarding_status');
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('onboarding_status', foreignKey);
      }
    }

    await queryRunner.dropTable('onboarding_status');
  }
}
