import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add Row-Level Security (RLS) policies to api_usage table
 * Story 3.7: Per-Workspace Cost Isolation
 *
 * This migration implements defense-in-depth security by adding PostgreSQL
 * Row-Level Security policies to enforce workspace isolation at the database level.
 * Even if application code has a bug, the database will prevent cross-workspace access.
 *
 * RLS Policies:
 * 1. workspace_isolation_policy: Restricts SELECT queries to current workspace
 * 2. workspace_insert_policy: Ensures INSERTs only use authenticated workspace
 * 3. workspace_update_policy: Prevents UPDATE/DELETE across workspaces
 *
 * Note: RLS policies use current_setting('app.current_workspace_id')
 * which must be set by the application before queries.
 */
export class AddApiUsageRLS1738470000000 implements MigrationInterface {
  name = 'AddApiUsageRLS1738470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable Row-Level Security on api_usage table
    await queryRunner.query(
      `ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY`,
    );

    // Policy 1: SELECT - Only allow reading rows from current workspace
    // SECURITY: Removed IS NULL bypass - context MUST be set
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_select_policy ON api_usage
        FOR SELECT
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 2: INSERT - Only allow inserting rows for current workspace
    // SECURITY: Removed IS NULL bypass - context MUST be set
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_insert_policy ON api_usage
        FOR INSERT
        WITH CHECK (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 3: UPDATE - Prevent updates across workspaces
    // SECURITY: Removed IS NULL bypass - context MUST be set
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_update_policy ON api_usage
        FOR UPDATE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Policy 4: DELETE - Prevent deletes across workspaces
    // SECURITY: Removed IS NULL bypass - context MUST be set
    await queryRunner.query(`
      CREATE POLICY workspace_isolation_delete_policy ON api_usage
        FOR DELETE
        USING (
          workspace_id::text = current_setting('app.current_workspace_id', TRUE)
        )
    `);

    // Create helper function to set workspace context
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_workspace_context(workspace_id_param TEXT)
      RETURNS VOID AS $$
      BEGIN
        PERFORM set_config('app.current_workspace_id', workspace_id_param, FALSE);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    // Create helper function to clear workspace context
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION clear_workspace_context()
      RETURNS VOID AS $$
      BEGIN
        PERFORM set_config('app.current_workspace_id', NULL, FALSE);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop helper functions
    await queryRunner.query(`DROP FUNCTION IF EXISTS clear_workspace_context()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_workspace_context(TEXT)`);

    // Drop policies
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_delete_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_update_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_insert_policy ON api_usage`);
    await queryRunner.query(`DROP POLICY IF EXISTS workspace_isolation_select_policy ON api_usage`);

    // Disable Row-Level Security
    await queryRunner.query(
      `ALTER TABLE api_usage DISABLE ROW LEVEL SECURITY`,
    );
  }
}
