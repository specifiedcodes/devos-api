import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkspaceMemberRoleIndex1738300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix Issue #6: Add index on workspace_members.role for RBAC query performance
    await queryRunner.query(
      'CREATE INDEX "idx_workspace_members_role" ON "workspace_members" ("role")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_workspace_members_role"');
  }
}
