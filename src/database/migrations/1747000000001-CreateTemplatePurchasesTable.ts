import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Create Template Purchases Table
 *
 * Story 19-10: Template Revenue Sharing
 *
 * Creates the template_purchases table for tracking template purchases
 * with Stripe Connect payment processing and revenue splitting.
 */
export class CreateTemplatePurchasesTable1747000000001 implements MigrationInterface {
  name = 'CreateTemplatePurchasesTable1747000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (idempotent)
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'template_purchases'
      )
    `);

    if (tableExists[0]?.exists) {
      return;
    }

    await queryRunner.query(`
      CREATE TABLE "template_purchases" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "buyer_user_id" UUID NOT NULL,
        "buyer_workspace_id" UUID NOT NULL,
        "template_id" UUID NOT NULL,
        "seller_user_id" UUID NOT NULL,
        "stripe_payment_intent_id" VARCHAR(255) NOT NULL,
        "stripe_transfer_id" VARCHAR(255) DEFAULT NULL,
        "amount_cents" INTEGER NOT NULL,
        "platform_fee_cents" INTEGER NOT NULL,
        "creator_amount_cents" INTEGER NOT NULL,
        "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
        "status" VARCHAR(20) NOT NULL,
        "refunded_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
        "refund_reason" TEXT DEFAULT NULL,
        "refunded_by" UUID DEFAULT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_template_purchases" PRIMARY KEY ("id"),
        CONSTRAINT "fk_template_purchases_buyer_user" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_template_purchases_buyer_workspace" FOREIGN KEY ("buyer_workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_template_purchases_template" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_template_purchases_seller_user" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_template_purchase_status" CHECK ("status" IN ('pending', 'completed', 'refunded', 'failed', 'cancelled')),
        CONSTRAINT "ck_template_purchase_amount_cents" CHECK ("amount_cents" >= 0),
        CONSTRAINT "ck_template_purchase_platform_fee_cents" CHECK ("platform_fee_cents" >= 0),
        CONSTRAINT "ck_template_purchase_creator_amount_cents" CHECK ("creator_amount_cents" >= 0)
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "idx_template_purchases_buyer_user_id" ON "template_purchases" ("buyer_user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_template_purchases_template_id" ON "template_purchases" ("template_id")`);
    await queryRunner.query(`CREATE INDEX "idx_template_purchases_stripe_payment_intent_id" ON "template_purchases" ("stripe_payment_intent_id")`);
    await queryRunner.query(`CREATE INDEX "idx_template_purchases_status" ON "template_purchases" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_template_purchases_seller_user_id" ON "template_purchases" ("seller_user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_purchases_seller_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_purchases_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_purchases_stripe_payment_intent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_purchases_template_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_template_purchases_buyer_user_id"`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS "template_purchases"`);
  }
}
