/**
 * Migration: Create White-Label Config Table
 * Story 22-1: White-Label Configuration (AC1)
 *
 * Creates the white_label_configs table for per-workspace branding configuration.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhiteLabelConfigTable1773000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE white_label_background_mode AS ENUM ('light', 'dark', 'system');
    `);

    await queryRunner.query(`
      CREATE TYPE white_label_domain_status AS ENUM ('pending', 'verifying', 'verified', 'failed');
    `);

    // Create main table
    await queryRunner.query(`
      CREATE TABLE white_label_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        app_name VARCHAR(100) NOT NULL DEFAULT 'DevOS',
        logo_url VARCHAR(1024),
        logo_dark_url VARCHAR(1024),
        favicon_url VARCHAR(1024),
        primary_color VARCHAR(7) NOT NULL DEFAULT '#6366F1',
        secondary_color VARCHAR(7) NOT NULL DEFAULT '#8B5CF6',
        background_mode white_label_background_mode NOT NULL DEFAULT 'system',
        font_family VARCHAR(255) NOT NULL DEFAULT 'Inter',
        custom_css TEXT,
        custom_domain VARCHAR(253),
        domain_status white_label_domain_status DEFAULT 'pending',
        domain_verification_token VARCHAR(64),
        domain_verified_at TIMESTAMP WITH TIME ZONE,
        ssl_provisioned BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_white_label_config_workspace ON white_label_configs (workspace_id);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_white_label_config_domain ON white_label_configs (custom_domain) WHERE custom_domain IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_white_label_config_active ON white_label_configs (is_active) WHERE is_active = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_white_label_config_active;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_white_label_config_domain;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_white_label_config_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS white_label_configs;`);
    await queryRunner.query(`DROP TYPE IF EXISTS white_label_domain_status;`);
    await queryRunner.query(`DROP TYPE IF EXISTS white_label_background_mode;`);
  }
}
