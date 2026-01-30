import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceSecurityEvents1738300100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix Issue #4: Add workspace-related security event types
    await queryRunner.query(`
      ALTER TYPE "security_events_event_type_enum"
      ADD VALUE IF NOT EXISTS 'workspace_created';
    `);

    await queryRunner.query(`
      ALTER TYPE "security_events_event_type_enum"
      ADD VALUE IF NOT EXISTS 'workspace_creation_failed';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values
    // This is a one-way migration
  }
}
