import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomAgentTypeAndDefinitionRef1741600100000 implements MigrationInterface {
  name = 'AddCustomAgentTypeAndDefinitionRef1741600100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE agent_type_enum ADD VALUE IF NOT EXISTS 'custom'`);
    await queryRunner.query(`ALTER TABLE agents ADD COLUMN agent_definition_id UUID`);
    await queryRunner.query(`
      ALTER TABLE agents ADD CONSTRAINT fk_agents_agent_definition
        FOREIGN KEY (agent_definition_id) REFERENCES agent_definitions(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX idx_agents_agent_definition ON agents (agent_definition_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agents_agent_definition`);
    await queryRunner.query(`ALTER TABLE agents DROP CONSTRAINT IF EXISTS fk_agents_agent_definition`);
    await queryRunner.query(`ALTER TABLE agents DROP COLUMN IF EXISTS agent_definition_id`);
    // Note: Cannot remove enum value in PostgreSQL, leaving 'custom' in enum
  }
}
