/**
 * Migration: Create White-Label Email Template Table
 * Story 22-2: White-Label Email Templates (AC1)
 *
 * Creates the white_label_email_templates table for per-workspace custom email templates.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhiteLabelEmailTemplateTable1774000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE email_template_type AS ENUM (
        'invitation',
        'password_reset',
        '2fa_setup',
        'deployment',
        'cost_alert',
        'weekly_digest'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE white_label_email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        template_type email_template_type NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body_html TEXT NOT NULL,
        body_text TEXT,
        is_custom BOOLEAN DEFAULT true,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_workspace_template_type UNIQUE (workspace_id, template_type)
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wl_email_template_workspace ON white_label_email_templates (workspace_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_wl_email_template_type ON white_label_email_templates (template_type);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wl_email_template_type;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wl_email_template_workspace;`);
    await queryRunner.query(`DROP TABLE IF EXISTS white_label_email_templates;`);
    await queryRunner.query(`DROP TYPE IF EXISTS email_template_type;`);
  }
}
