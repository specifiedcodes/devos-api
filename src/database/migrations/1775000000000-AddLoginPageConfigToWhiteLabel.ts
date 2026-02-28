import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoginPageConfigToWhiteLabel1775000000000 implements MigrationInterface {
  name = 'AddLoginPageConfigToWhiteLabel1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS show_devos_branding BOOLEAN DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS background_type VARCHAR(20) DEFAULT 'color'
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS background_value VARCHAR(1024) DEFAULT '#f3f4f6'
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS hero_text VARCHAR(255)
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS hero_subtext VARCHAR(500)
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS show_signup BOOLEAN DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs
      ADD COLUMN IF NOT EXISTS login_page_css TEXT
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN white_label_configs.background_type IS 'color, gradient, or image'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN white_label_configs.background_value IS 'hex color, gradient CSS, or image URL'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN white_label_configs.custom_links IS 'Array of {text: string, url: string} objects for footer links'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS login_page_css
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS show_signup
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS custom_links
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS hero_subtext
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS hero_text
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS background_value
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS background_type
    `);

    await queryRunner.query(`
      ALTER TABLE white_label_configs DROP COLUMN IF EXISTS show_devos_branding
    `);
  }
}
