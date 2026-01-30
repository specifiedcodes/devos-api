import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSpendingLimits1738368000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add spending limit columns to workspace_settings table
    await queryRunner.addColumns('workspace_settings', [
      new TableColumn({
        name: 'monthly_limit_usd',
        type: 'decimal',
        precision: 10,
        scale: 2,
        isNullable: true,
        default: null,
      }),
      new TableColumn({
        name: 'alert_thresholds',
        type: 'integer',
        isArray: true,
        isNullable: true,
        default: "ARRAY[80, 90, 100]",
      }),
      new TableColumn({
        name: 'limit_enabled',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
      new TableColumn({
        name: 'triggered_alerts',
        type: 'jsonb',
        default: "'{}'",
        isNullable: false,
      }),
    ]);

    // Add index for efficient querying of workspaces with limits enabled
    await queryRunner.query(`
      CREATE INDEX idx_workspace_settings_limit_enabled
      ON workspace_settings(limit_enabled)
      WHERE limit_enabled = true;
    `);

    // Create notifications table for in-app alerts
    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Add indices for efficient notification queries
    await queryRunner.query(`
      CREATE INDEX idx_notifications_workspace_user
      ON notifications(workspace_id, user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notifications_unread
      ON notifications(workspace_id, user_id, read_at)
      WHERE read_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notifications_created_at
      ON notifications(created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop notifications table
    await queryRunner.query(`DROP TABLE IF EXISTS notifications;`);

    // Drop spending limit columns from workspace_settings
    await queryRunner.dropColumn('workspace_settings', 'triggered_alerts');
    await queryRunner.dropColumn('workspace_settings', 'limit_enabled');
    await queryRunner.dropColumn('workspace_settings', 'alert_thresholds');
    await queryRunner.dropColumn('workspace_settings', 'monthly_limit_usd');

    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_workspace_settings_limit_enabled;
    `);
  }
}
