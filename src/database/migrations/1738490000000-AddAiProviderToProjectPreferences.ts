import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiProviderToProjectPreferences1738490000000
  implements MigrationInterface
{
  name = 'AddAiProviderToProjectPreferences1738490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add ai_provider column with default 'anthropic'
    await queryRunner.query(`
      ALTER TABLE "project_preferences"
      ADD COLUMN "ai_provider" character varying(20) NOT NULL DEFAULT 'anthropic'
    `);

    // Add ai_model column with default 'claude-sonnet-4-5-20250929'
    await queryRunner.query(`
      ALTER TABLE "project_preferences"
      ADD COLUMN "ai_model" character varying(100) NOT NULL DEFAULT 'claude-sonnet-4-5-20250929'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "project_preferences" DROP COLUMN "ai_model"
    `);

    await queryRunner.query(`
      ALTER TABLE "project_preferences" DROP COLUMN "ai_provider"
    `);
  }
}
