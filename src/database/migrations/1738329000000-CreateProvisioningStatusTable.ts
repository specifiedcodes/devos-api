import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableCheck } from 'typeorm';

/**
 * Migration: Create Provisioning Status Table
 *
 * Creates the provisioning_status table to track multi-step resource provisioning
 * during project creation (GitHub repo, database, deployment, project initialization).
 *
 * This is part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 *
 * @see ProvisioningStatus entity
 */
export class CreateProvisioningStatusTable1738329000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create provisioning_status table
    await queryRunner.createTable(
      new Table({
        name: 'provisioning_status',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'in_progress', 'completed', 'failed'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'steps',
            type: 'jsonb',
            default: `'{
              "github_repo_created": {"status": "pending"},
              "database_provisioned": {"status": "pending"},
              "deployment_configured": {"status": "pending"},
              "project_initialized": {"status": "pending"}
            }'::jsonb`,
            isNullable: false,
          },
          {
            name: 'current_step',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create unique index on project_id (primary lookup)
    await queryRunner.createIndex(
      'provisioning_status',
      new TableIndex({
        name: 'idx_provisioning_status_project_id',
        columnNames: ['project_id'],
        isUnique: true,
      }),
    );

    // Create index on workspace_id (workspace-level queries)
    await queryRunner.createIndex(
      'provisioning_status',
      new TableIndex({
        name: 'idx_provisioning_status_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    // Create index on status (filter active provisioning jobs)
    await queryRunner.createIndex(
      'provisioning_status',
      new TableIndex({
        name: 'idx_provisioning_status_status',
        columnNames: ['status'],
      }),
    );

    // Add foreign key to projects table with CASCADE delete
    await queryRunner.createForeignKey(
      'provisioning_status',
      new TableForeignKey({
        name: 'fk_provisioning_status_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key to workspaces table with CASCADE delete
    await queryRunner.createForeignKey(
      'provisioning_status',
      new TableForeignKey({
        name: 'fk_provisioning_status_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add CHECK constraint on status column
    await queryRunner.createCheckConstraint(
      'provisioning_status',
      new TableCheck({
        name: 'chk_provisioning_status_valid',
        expression: "status IN ('pending', 'in_progress', 'completed', 'failed')",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop table (will cascade drop indexes, foreign keys, and constraints)
    await queryRunner.dropTable('provisioning_status', true);
  }
}
