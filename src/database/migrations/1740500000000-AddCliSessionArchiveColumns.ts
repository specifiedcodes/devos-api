import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddCliSessionArchiveColumns Migration
 * Story 16.3: CLI Session Archive Storage (AC1)
 *
 * Adds storage_key and archived_at columns to cli_sessions table
 * with partial indexes for efficient archive queries.
 */
export class AddCliSessionArchiveColumns1740500000000 implements MigrationInterface {
  name = 'AddCliSessionArchiveColumns1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add storage_key column
    await queryRunner.query(`
      ALTER TABLE cli_sessions
      ADD COLUMN storage_key VARCHAR(500) DEFAULT NULL
    `);

    // Add archived_at column
    await queryRunner.query(`
      ALTER TABLE cli_sessions
      ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    `);

    // Partial index on archived_at WHERE archived_at IS NULL (fast lookup for pending archive)
    await queryRunner.query(`
      CREATE INDEX idx_cli_sessions_archived_at
      ON cli_sessions (archived_at)
      WHERE archived_at IS NULL
    `);

    // Partial index on storage_key WHERE storage_key IS NOT NULL (fast lookup for archived sessions)
    await queryRunner.query(`
      CREATE INDEX idx_cli_sessions_storage_key
      ON cli_sessions (storage_key)
      WHERE storage_key IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_cli_sessions_storage_key');
    await queryRunner.query('DROP INDEX IF EXISTS idx_cli_sessions_archived_at');
    await queryRunner.query('ALTER TABLE cli_sessions DROP COLUMN IF EXISTS archived_at');
    await queryRunner.query('ALTER TABLE cli_sessions DROP COLUMN IF EXISTS storage_key');
  }
}
