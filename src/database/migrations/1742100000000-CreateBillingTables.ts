import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingTables1742100000000 implements MigrationInterface {
  name = 'CreateBillingTables1742100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create creator_payout_accounts table
    await queryRunner.query(`
      CREATE TABLE creator_payout_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stripe_account_id VARCHAR(255) NOT NULL,
        onboarding_complete BOOLEAN NOT NULL DEFAULT false,
        charges_enabled BOOLEAN NOT NULL DEFAULT false,
        payouts_enabled BOOLEAN NOT NULL DEFAULT false,
        country VARCHAR(2),
        default_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        onboarding_completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_creator_payout_accounts_user UNIQUE (user_id)
      );
    `);

    // Create indexes for creator_payout_accounts
    await queryRunner.query(`CREATE INDEX idx_creator_payout_accounts_stripe ON creator_payout_accounts (stripe_account_id)`);

    // Create payout_transactions table
    await queryRunner.query(`
      CREATE TABLE payout_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payout_account_id UUID NOT NULL REFERENCES creator_payout_accounts(id) ON DELETE CASCADE,
        stripe_payout_id VARCHAR(255),
        amount_cents INT NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL,
        description TEXT,
        failure_reason TEXT,
        processed_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_payout_transactions_amount CHECK (amount_cents >= 1)
      );
    `);

    // Create indexes for payout_transactions
    await queryRunner.query(`CREATE INDEX idx_payout_transactions_account ON payout_transactions (payout_account_id)`);
    await queryRunner.query(`CREATE INDEX idx_payout_transactions_status ON payout_transactions (status)`);
    await queryRunner.query(`CREATE INDEX idx_payout_transactions_stripe ON payout_transactions (stripe_payout_id)`);

    // Create agent_purchases table
    await queryRunner.query(`
      CREATE TABLE agent_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        buyer_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        installed_agent_id UUID REFERENCES installed_agents(id) ON DELETE SET NULL,
        purchase_type VARCHAR(20) NOT NULL,
        stripe_payment_intent_id VARCHAR(255) NOT NULL,
        stripe_transfer_id VARCHAR(255),
        amount_cents INT NOT NULL,
        platform_fee_cents INT NOT NULL,
        creator_amount_cents INT NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        status VARCHAR(20) NOT NULL,
        refunded_at TIMESTAMP WITH TIME ZONE,
        refund_reason TEXT,
        refunded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_agent_purchases_amount CHECK (amount_cents >= 0),
        CONSTRAINT chk_agent_purchases_platform_fee CHECK (platform_fee_cents >= 0),
        CONSTRAINT chk_agent_purchases_creator_amount CHECK (creator_amount_cents >= 0)
      );
    `);

    // Create indexes for agent_purchases
    await queryRunner.query(`CREATE INDEX idx_agent_purchases_buyer ON agent_purchases (buyer_user_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_purchases_agent ON agent_purchases (marketplace_agent_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_purchases_payment_intent ON agent_purchases (stripe_payment_intent_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_purchases_status ON agent_purchases (status)`);

    // Create agent_subscriptions table for future subscription support
    await queryRunner.query(`
      CREATE TABLE agent_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        stripe_subscription_id VARCHAR(255) NOT NULL,
        stripe_price_id VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL,
        current_period_start INT NOT NULL,
        current_period_end INT NOT NULL,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_agent_subscriptions_stripe UNIQUE (stripe_subscription_id)
      );
    `);

    // Create indexes for agent_subscriptions
    await queryRunner.query(`CREATE INDEX idx_agent_subscriptions_user ON agent_subscriptions (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_subscriptions_agent ON agent_subscriptions (marketplace_agent_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_subscriptions_status ON agent_subscriptions (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop agent_subscriptions
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_subscriptions_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_subscriptions_agent`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_subscriptions_user`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_subscriptions`);

    // Drop agent_purchases
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_purchases_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_purchases_payment_intent`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_purchases_agent`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_purchases_buyer`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_purchases`);

    // Drop payout_transactions
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payout_transactions_stripe`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payout_transactions_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payout_transactions_account`);
    await queryRunner.query(`DROP TABLE IF EXISTS payout_transactions`);

    // Drop creator_payout_accounts
    await queryRunner.query(`DROP INDEX IF EXISTS idx_creator_payout_accounts_stripe`);
    await queryRunner.query(`DROP TABLE IF EXISTS creator_payout_accounts`);
  }
}
