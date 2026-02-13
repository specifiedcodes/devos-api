import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: Add Activity Status to Agents
 * Story 9.3: Agent Status Updates
 *
 * Adds fine-grained activity status tracking to the agents table.
 */
export class AddAgentActivityStatus1739500000000 implements MigrationInterface {
  name = 'AddAgentActivityStatus1739500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add activity_status column
    await queryRunner.addColumn(
      'agents',
      new TableColumn({
        name: 'activity_status',
        type: 'varchar',
        length: '50',
        isNullable: true,
        default: "'idle'",
      }),
    );

    // Add activity_status_since column
    await queryRunner.addColumn(
      'agents',
      new TableColumn({
        name: 'activity_status_since',
        type: 'timestamptz',
        isNullable: true,
      }),
    );

    // Add activity_message column
    await queryRunner.addColumn(
      'agents',
      new TableColumn({
        name: 'activity_message',
        type: 'text',
        isNullable: true,
      }),
    );

    // Add index on activity_status for efficient filtering
    await queryRunner.query(`
      CREATE INDEX "IDX_agents_activity_status" ON "agents" ("activity_status")
    `);

    // Add composite index for workspace + activity_status queries
    await queryRunner.query(`
      CREATE INDEX "IDX_agents_workspace_activity_status" ON "agents" ("workspace_id", "activity_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agents_workspace_activity_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agents_activity_status"`);

    // Drop columns
    await queryRunner.dropColumn('agents', 'activity_message');
    await queryRunner.dropColumn('agents', 'activity_status_since');
    await queryRunner.dropColumn('agents', 'activity_status');
  }
}
