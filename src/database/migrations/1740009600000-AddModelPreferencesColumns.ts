import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: AddModelPreferencesColumns
 * Story 13-9: User Model Preferences
 *
 * Adds model preference configuration columns to workspace_settings table.
 * All columns have safe defaults so existing workspaces are unaffected.
 */
export class AddModelPreferencesColumns1740009600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add model_preset column (VARCHAR(20), DEFAULT 'balanced')
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'model_preset',
        type: 'varchar',
        length: '20',
        default: "'balanced'",
        isNullable: false,
      }),
    );

    // Add task_model_overrides column (JSONB, DEFAULT '{}')
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'task_model_overrides',
        type: 'jsonb',
        default: "'{}'",
        isNullable: false,
      }),
    );

    // Add enabled_providers column (JSONB, DEFAULT '[]')
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'enabled_providers',
        type: 'jsonb',
        default: "'[]'",
        isNullable: false,
      }),
    );

    // Add provider_priority column (JSONB, DEFAULT '[]')
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'provider_priority',
        type: 'jsonb',
        default: "'[]'",
        isNullable: false,
      }),
    );

    // Add model_preferences_enabled column (BOOLEAN, DEFAULT false)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'model_preferences_enabled',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns in reverse order
    await queryRunner.dropColumn('workspace_settings', 'model_preferences_enabled');
    await queryRunner.dropColumn('workspace_settings', 'provider_priority');
    await queryRunner.dropColumn('workspace_settings', 'enabled_providers');
    await queryRunner.dropColumn('workspace_settings', 'task_model_overrides');
    await queryRunner.dropColumn('workspace_settings', 'model_preset');
  }
}
