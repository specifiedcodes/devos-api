import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add Template Pricing Columns
 *
 * Story 19-10: Template Revenue Sharing
 *
 * Adds pricing columns to the templates table:
 * - pricing_type: VARCHAR(10) with default 'free'
 * - price_cents: INTEGER nullable (min $5.00 = 500 cents, max $499.99 = 49999 cents)
 */
export class AddTemplatePricingColumns1747000000000 implements MigrationInterface {
  name = 'AddTemplatePricingColumns1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if columns already exist (idempotent)
    const templatesColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'templates'
    `);

    const existingColumns = templatesColumns.map((c: { column_name: string }) => c.column_name);

    // Add pricing_type column if it doesn't exist
    if (!existingColumns.includes('pricing_type')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "pricing_type" VARCHAR(10) NOT NULL DEFAULT 'free'
      `);

      // Add check constraint for pricing_type values
      await queryRunner.query(`
        ALTER TABLE "templates" ADD CONSTRAINT "ck_template_pricing_type"
        CHECK ("pricing_type" IN ('free', 'paid'))
      `);
    }

    // Add price_cents column if it doesn't exist
    if (!existingColumns.includes('price_cents')) {
      await queryRunner.query(`
        ALTER TABLE "templates" ADD COLUMN "price_cents" INTEGER DEFAULT NULL
      `);

      // Add check constraint for price_cents range
      await queryRunner.query(`
        ALTER TABLE "templates" ADD CONSTRAINT "ck_template_price_cents_range"
        CHECK ("price_cents" IS NULL OR ("price_cents" >= 500 AND "price_cents" <= 49999))
      `);
    }

    // Create index for pricing type filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_template_pricing_type" ON "templates" ("pricing_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_pricing_type"`);

    // Drop check constraints
    await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "ck_template_price_cents_range"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP CONSTRAINT IF EXISTS "ck_template_pricing_type"`);

    // Drop columns
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "price_cents"`);
    await queryRunner.query(`ALTER TABLE "templates" DROP COLUMN IF EXISTS "pricing_type"`);
  }
}
