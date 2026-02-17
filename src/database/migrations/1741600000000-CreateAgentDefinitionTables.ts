import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentDefinitionTables1741600000000 implements MigrationInterface {
  name = 'CreateAgentDefinitionTables1741600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE agent_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
        schema_version VARCHAR(10) NOT NULL DEFAULT 'v1',
        definition JSONB NOT NULL,
        icon VARCHAR(100) DEFAULT 'bot',
        category VARCHAR(50) NOT NULL DEFAULT 'custom',
        tags TEXT[] DEFAULT '{}',
        is_published BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_agent_def_workspace_name UNIQUE (workspace_id, name)
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_agent_def_workspace ON agent_definitions (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_workspace_active ON agent_definitions (workspace_id, is_active)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_category ON agent_definitions (category)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_created_by ON agent_definitions (created_by)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_tags ON agent_definitions USING GIN (tags)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_definition ON agent_definitions USING GIN (definition)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_is_published ON agent_definitions (is_published) WHERE is_published = true`);

    await queryRunner.query(`
      CREATE TABLE agent_definition_audit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_definition_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
        event_type VARCHAR(60) NOT NULL,
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`CREATE INDEX idx_agent_def_audit_workspace ON agent_definition_audit_events (workspace_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_audit_definition ON agent_definition_audit_events (agent_definition_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_audit_event_type ON agent_definition_audit_events (event_type)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_audit_actor ON agent_definition_audit_events (actor_id)`);
    await queryRunner.query(`CREATE INDEX idx_agent_def_audit_created ON agent_definition_audit_events (created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_audit_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_audit_actor`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_audit_event_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_audit_definition`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_audit_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_definition_audit_events`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_is_published`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_definition`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_tags`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_created_by`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_category`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_workspace_active`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_def_workspace`);
    await queryRunner.query(`DROP TABLE IF EXISTS agent_definitions`);
  }
}
