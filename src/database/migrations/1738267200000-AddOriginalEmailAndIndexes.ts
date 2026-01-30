import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOriginalEmailAndIndexes1738267200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add original_email column to account_deletions table
    await queryRunner.query(`
      ALTER TABLE account_deletions
      ADD COLUMN original_email VARCHAR(255) NOT NULL DEFAULT '';
    `);

    // Create index on original_email for faster lookups during registration
    await queryRunner.query(`
      CREATE INDEX idx_account_deletions_original_email
      ON account_deletions(original_email);
    `);

    // Create index on deleted_at column in users table for cleanup job performance
    await queryRunner.query(`
      CREATE INDEX idx_users_deleted_at
      ON users(deleted_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_users_deleted_at;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_account_deletions_original_email;
    `);

    // Drop original_email column
    await queryRunner.query(`
      ALTER TABLE account_deletions
      DROP COLUMN original_email;
    `);
  }
}
