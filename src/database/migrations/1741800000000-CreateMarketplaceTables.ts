import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketplaceTables1741800000000 implements MigrationInterface {
  name = 'CreateMarketplaceTables1741800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create marketplace_agents table (public schema for cross-workspace access)
    await queryRunner.query(`
      CREATE TABLE marketplace_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_definition_id UUID NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
        publisher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        publisher_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        short_description VARCHAR(200) NOT NULL,
        long_description TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        tags TEXT[] DEFAULT '{}',
        icon_url VARCHAR(255),
        screenshots TEXT[] DEFAULT '{}',
        latest_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
        total_installs INT NOT NULL DEFAULT 0,
        avg_rating DECIMAL(3, 2) NOT NULL DEFAULT 0,
        rating_count INT NOT NULL DEFAULT 0,
        is_featured BOOLEAN NOT NULL DEFAULT false,
        is_verified BOOLEAN NOT NULL DEFAULT false,
        pricing_type VARCHAR(20) NOT NULL DEFAULT 'free',
        price_cents INT,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_marketplace_agents_name UNIQUE (name),
        CONSTRAINT chk_marketplace_agents_rating CHECK (avg_rating >= 0 AND avg_rating <= 5)
      );
    `);

    // Create indexes for marketplace_agents
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_category ON marketplace_agents (category)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_publisher_user ON marketplace_agents (publisher_user_id)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_status ON marketplace_agents (status)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_featured ON marketplace_agents (is_featured) WHERE is_featured = true`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_pricing ON marketplace_agents (pricing_type)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_rating ON marketplace_agents (avg_rating DESC)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_installs ON marketplace_agents (total_installs DESC)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_agents_tags ON marketplace_agents USING GIN (tags)`);
    await queryRunner.query(`
      CREATE INDEX idx_marketplace_agents_search ON marketplace_agents
      USING GIN (to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(long_description, '')))
    `);

    // Create marketplace_reviews table
    await queryRunner.query(`
      CREATE TABLE marketplace_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewer_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        rating INT NOT NULL,
        review TEXT,
        version_reviewed VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_marketplace_reviews_agent_user UNIQUE (marketplace_agent_id, reviewer_user_id),
        CONSTRAINT chk_marketplace_reviews_rating CHECK (rating >= 1 AND rating <= 5)
      );
    `);

    // Create indexes for marketplace_reviews
    await queryRunner.query(`CREATE INDEX idx_marketplace_reviews_agent ON marketplace_reviews (marketplace_agent_id)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_reviews_reviewer ON marketplace_reviews (reviewer_user_id)`);
    await queryRunner.query(`CREATE INDEX idx_marketplace_reviews_rating ON marketplace_reviews (rating)`);

    // Create installed_agents table
    await queryRunner.query(`
      CREATE TABLE installed_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        marketplace_agent_id UUID NOT NULL REFERENCES marketplace_agents(id) ON DELETE CASCADE,
        installed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        installed_version VARCHAR(50) NOT NULL,
        auto_update BOOLEAN NOT NULL DEFAULT false,
        local_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
        installed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_installed_agents_workspace_agent UNIQUE (workspace_id, marketplace_agent_id)
      );
    `);

    // Create indexes for installed_agents
    await queryRunner.query(`CREATE INDEX idx_installed_agents_workspace ON installed_agents (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_installed_agents_marketplace ON installed_agents (marketplace_agent_id)`);
    await queryRunner.query(`CREATE INDEX idx_installed_agents_installed_by ON installed_agents (installed_by)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop installed_agents
    await queryRunner.query(`DROP INDEX IF EXISTS idx_installed_agents_installed_by`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_installed_agents_marketplace`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_installed_agents_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS installed_agents`);

    // Drop marketplace_reviews
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_reviews_rating`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_reviews_reviewer`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_reviews_agent`);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_reviews`);

    // Drop marketplace_agents
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_search`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_tags`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_installs`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_rating`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_pricing`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_featured`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_publisher_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_marketplace_agents_category`);
    await queryRunner.query(`DROP TABLE IF EXISTS marketplace_agents`);
  }
}
