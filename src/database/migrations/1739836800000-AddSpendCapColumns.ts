import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: AddSpendCapColumns
 * Story 13-7: Spend Caps & Auto-Downgrade
 *
 * Adds spend cap configuration columns to workspace_settings table.
 * All columns have safe defaults so existing workspaces are unaffected.
 */
export class AddSpendCapColumns1739836800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add spend_cap_enabled column (BOOLEAN, DEFAULT false)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'spend_cap_enabled',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Add warning_threshold column (DECIMAL(3,2), DEFAULT 0.70)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'warning_threshold',
        type: 'decimal',
        precision: 3,
        scale: 2,
        default: 0.70,
        isNullable: false,
      }),
    );

    // Add downgrade_threshold column (DECIMAL(3,2), DEFAULT 0.85)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'downgrade_threshold',
        type: 'decimal',
        precision: 3,
        scale: 2,
        default: 0.85,
        isNullable: false,
      }),
    );

    // Add critical_threshold column (DECIMAL(3,2), DEFAULT 0.95)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'critical_threshold',
        type: 'decimal',
        precision: 3,
        scale: 2,
        default: 0.95,
        isNullable: false,
      }),
    );

    // Add hard_cap_threshold column (DECIMAL(3,2), DEFAULT 1.00)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'hard_cap_threshold',
        type: 'decimal',
        precision: 3,
        scale: 2,
        default: 1.00,
        isNullable: false,
      }),
    );

    // Add downgrade_rules column (JSONB, DEFAULT '{}')
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'downgrade_rules',
        type: 'jsonb',
        default: "'{}'",
        isNullable: false,
      }),
    );

    // Add force_premium_override column (BOOLEAN, DEFAULT false)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'force_premium_override',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    // Add auto_downgrade_paused column (BOOLEAN, DEFAULT false)
    await queryRunner.addColumn(
      'workspace_settings',
      new TableColumn({
        name: 'auto_downgrade_paused',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns in reverse order
    await queryRunner.dropColumn('workspace_settings', 'auto_downgrade_paused');
    await queryRunner.dropColumn('workspace_settings', 'force_premium_override');
    await queryRunner.dropColumn('workspace_settings', 'downgrade_rules');
    await queryRunner.dropColumn('workspace_settings', 'hard_cap_threshold');
    await queryRunner.dropColumn('workspace_settings', 'critical_threshold');
    await queryRunner.dropColumn('workspace_settings', 'downgrade_threshold');
    await queryRunner.dropColumn('workspace_settings', 'warning_threshold');
    await queryRunner.dropColumn('workspace_settings', 'spend_cap_enabled');
  }
}
