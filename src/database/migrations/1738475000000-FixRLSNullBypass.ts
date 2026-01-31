import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to fix RLS NULL bypass vulnerability
 * Code Review Fix for Story 3.7: Per-Workspace Cost Isolation
 *
 * SECURITY FIX: The original RLS policies had an "OR IS NULL" clause that
 * allowed bypassing workspace isolation if the context wasn't set.
 *
 * This migration removes that bypass, making RLS policies fail-safe:
 * - If context is not set, queries return no results (safe default)
 * - Forces the application to always set workspace context
 * - WorkspaceContextInterceptor now fails fast if context setting fails
 */
export class FixRLSNullBypass1738475000000 implements MigrationInterface {
  name = 'FixRLSNullBypass1738475000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop existing policies
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_select_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_insert_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_update_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_delete_policy ON api_usage`);

    // Recreate policies WITHOUT the IS NULL bypass
    // Policy 1: SELECT - Only allow reading rows from current workspace
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_select_policy ON api_usage
        FOR SELECT
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 2: INSERT - Only allow inserting rows for current workspace
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_insert_policy ON api_usage
        FOR INSERT
        WITH CHECK (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 3: UPDATE - Prevent updates across workspaces
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_update_policy ON api_usage
        FOR UPDATE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 4: DELETE - Prevent deletes across workspaces
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_delete_policy ON api_usage
        FOR DELETE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original policies with NULL bypass (not recommended for security)
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_select_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_insert_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_update_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_delete_policy ON api_usage`);

    await queryRunner.query(`
      CREATE POLICY workspace_isolation_select_policy ON api_usage
        FOR SELECT
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
          OR current_setting('app.current_workspace_id', TRUE) IS NULL
        )
    `);

    await queryRunner.query(`
      CREATE POLICY workspace_isolation_insert_policy ON api_usage
        FOR INSERT
        WITH CHECK (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
          OR current_setting('app.current_workspace_id', TRUE) IS NULL
        )
    `);

    await queryRunner.query(`
      CREATE POLICY workspace_isolation_update_policy ON api_usage
        FOR UPDATE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
          OR current_setting('app.current_workspace_id', TRUE) IS NULL
        )
    `);

    await queryRunner.query(`
      CREATE POLICY workspace_isolation_delete_policy ON api_usage
        FOR DELETE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
          OR current_setting('app.current_workspace_id', TRUE) IS NULL
        )
    `);
  }
}
