import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSlackUserMappingTable1740700000000 implements MigrationInterface {
  name = 'CreateSlackUserMappingTable1740700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE slack_user_mappings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        slack_integration_id UUID NOT NULL REFERENCES slack_integrations(id) ON DELETE CASCADE,
        devos_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slack_user_id VARCHAR(50) NOT NULL,
        slack_username VARCHAR(255),
        slack_display_name VARCHAR(255),
        slack_email VARCHAR(255),
        is_auto_mapped BOOLEAN DEFAULT false,
        mapped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_slack_user_mapping_workspace_slack ON slack_user_mappings (workspace_id, slack_user_id);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_slack_user_mapping_workspace_devos ON slack_user_mappings (workspace_id, devos_user_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_slack_user_mapping_integration ON slack_user_mappings (slack_integration_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_user_mapping_integration;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_user_mapping_workspace_devos;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_slack_user_mapping_workspace_slack;`);
    await queryRunner.query(`DROP TABLE IF EXISTS slack_user_mappings;`);
  }
}
