import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Featured Template Fields
 *
 * Story 19-8: Featured Templates Curation
 *
 * Adds columns for featuring templates and tracking their test status:
 * - is_featured: Boolean to mark featured templates
 * - featured_order: Integer for ordering featured templates (0-7)
 * - last_test_run_at: Timestamp of last automated test run
 * - test_status: Enum for test status (unknown, passing, failing, pending)
 */
export class AddFeaturedTemplateFields1745000000000 implements MigrationInterface {
  name = 'AddFeaturedTemplateFields1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (idempotent)
    const templatesColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'templates'
    `);

    const existingColumns = templatesColumns.map((c: { column_name: string }) => c.column_name);

    // Add is_featured column if it doesn't exist
    if (!existingColumns.includes('is_featured')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "is_featured" BOOLEAN NOT NULL DEFAULT false
      `);
    }

    // Add featured_order column if it doesn't exist
    if (!existingColumns.includes('featured_order')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "featured_order" INTEGER DEFAULT NULL
      `);
    }

    // Add last_test_run_at column if it doesn't exist
    if (!existingColumns.includes('last_test_run_at')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "last_test_run_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL
      `);
    }

    // Add test_status column if it doesn't exist
    if (!existingColumns.includes('test_status')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "test_status" VARCHAR(20) NOT NULL DEFAULT 'unknown'
      `);

      // Add check constraint for test_status values
      await queryRunner.query(`
        ALTER TABLE "templates" ADD CONSTRAINT "ck_template_test_status"
        CHECK ("test_status" IN ('unknown', 'passing', 'failing', 'pending'))
      `);
    }

    // Create index for featured templates (only featured ones)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_featured" ON "templates" ("is_featured", "featured_order")
      WHERE "is_featured" = true
    `);

    // Create index for test status queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_test_status" ON "templates" ("test_status", "last_test_run_at")
      WHERE "is_featured" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_test_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_featured"`);

    // Drop check constraint
    await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "ck_template_test_status"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "test_status"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "last_test_run_at"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "featured_order"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "is_featured"`);
  }
}
