import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentVersionsTable1741700000000 implements MigrationInterface {
  name = 'CreateAgentVersionsTable1741700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add latest_published_version column to agent_definitions
    await queryRunner.query(`
      ALTER TABLE agent_definitions
      ADD COLUMN latest_published_version VARCHAR(50)
    `);

    // Create agent_versions table
    await queryRunner.query(`
      CREATE TABLE agent_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_definition_id UUID NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
        version VARCHAR(50) NOT NULL,
        definition_snapshot JSONB NOT NULL,
        changelog TEXT,
        is_published BOOLEAN NOT NULL DEFAULT false,
        published_at TIMESTAMP WITH TIME ZONE,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_agent_version_definition_version UNIQUE (agent_definition_id, version),
        CONSTRAINT chk_version_format CHECK (version ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$')
      );
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX idx_agent_versions_definition ON agent_versions (agent_definition_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_versions_created_by ON agent_versions (created_by)`);
    await queryRunner.query(`CREATE INDEX idx_agent_versions_is_published ON agent_versions (is_published)`);
    await queryRunner.query(`CREATE INDEX idx_agent_versions_definition_snapshot ON agent_versions USING GIN (definition_snapshot)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_versions_definition_snapshot`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_versions_is_published`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_versions_created_by`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_versions_definition`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS agent_versions`);

    // Remove column from agent_definitions
    await queryRunner.query(`ALTER TABLE agent_definitions DROP COLUMN IF EXISTS latest_published_version`);
  }
}
