import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiTokensTable1770000000008 implements MigrationInterface {
  name = 'CreateApiTokensTable1770000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_tokens" (
        "id" UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        "workspace_id" UUID NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "name" VARCHAR(100) NOT NULL,
        "token_hash" VARCHAR(255) NOT NULL,
        "token_prefix" VARCHAR(20) NOT NULL,
        "scopes" TEXT DEFAULT '',
        "is_active" BOOLEAN DEFAULT true,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_tokens_workspace" ON "api_tokens" ("workspace_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_tokens_token_hash" ON "api_tokens" ("token_hash")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_api_tokens_workspace_active" ON "api_tokens" ("workspace_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_api_tokens_workspace_active"`);
    await queryRunner.query(`DROP INDEX "IDX_api_tokens_token_hash"`);
    await queryRunner.query(`DROP INDEX "IDX_api_tokens_workspace"`);
    await queryRunner.query(`DROP TABLE "api_tokens"`);
  }
}
