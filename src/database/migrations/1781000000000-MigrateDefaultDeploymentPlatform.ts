import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Story 28.3: Default Deployment Platform Data Migration
 *
 * Migrates all workspaces to 'railway' as the default deployment platform.
 * This is part of the multi-provider deprecation (Epic 28).
 *
 * Up: Sets all workspace_settings.default_deployment_platform to 'railway'
 *     where it was 'vercel', 'supabase', or NULL.
 * Down: Sets default_deployment_platform back to NULL for records that
 *       were migrated (we cannot restore original values since we don't track them).
 */
export class MigrateDefaultDeploymentPlatform1781000000000
  implements MigrationInterface
{
  name = 'MigrateDefaultDeploymentPlatform1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migrate vercel -> railway
    const vercelResult = await queryRunner.query(
      `UPDATE workspace_settings SET default_deployment_platform = 'railway' WHERE default_deployment_platform = 'vercel'`,
    );
    const vercelCount = vercelResult?.[1] ?? 0;

    // Migrate supabase -> railway
    const supabaseResult = await queryRunner.query(
      `UPDATE workspace_settings SET default_deployment_platform = 'railway' WHERE default_deployment_platform = 'supabase'`,
    );
    const supabaseCount = supabaseResult?.[1] ?? 0;

    // Migrate NULL -> railway
    const nullResult = await queryRunner.query(
      `UPDATE workspace_settings SET default_deployment_platform = 'railway' WHERE default_deployment_platform IS NULL`,
    );
    const nullCount = nullResult?.[1] ?? 0;

    console.log(
      `[MigrateDefaultDeploymentPlatform] Migration complete: ` +
        `vercel=${vercelCount}, supabase=${supabaseCount}, null=${nullCount} ` +
        `rows updated to 'railway'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: set back to NULL (cannot restore original values)
    const result = await queryRunner.query(
      `UPDATE workspace_settings SET default_deployment_platform = NULL WHERE default_deployment_platform = 'railway'`,
    );
    const count = result?.[1] ?? 0;

    console.log(
      `[MigrateDefaultDeploymentPlatform] Revert complete: ${count} rows set to NULL`,
    );
  }
}
