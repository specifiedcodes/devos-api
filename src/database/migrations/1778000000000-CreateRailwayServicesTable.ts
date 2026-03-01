import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateRailwayServicesTable1778000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'railway_services',
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
          },
          {
            name: 'workspace_id',
            type: 'uuid',
          },
          {
            name: 'railway_project_id',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'railway_service_id',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'service_type',
            type: 'enum',
            enum: ['web', 'api', 'worker', 'database', 'cache', 'cron'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['provisioning', 'active', 'deploying', 'failed', 'stopped', 'removed'],
            default: "'provisioning'",
          },
          {
            name: 'deployment_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'custom_domain',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'railway_environment_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'github_repo',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'source_directory',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'deploy_order',
            type: 'int',
            default: 0,
          },
          {
            name: 'config',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'resource_info',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Foreign key: project_id -> projects(id) ON DELETE CASCADE
    await queryRunner.createForeignKey(
      'railway_services',
      new TableForeignKey({
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key: workspace_id -> workspaces(id) ON DELETE CASCADE
    await queryRunner.createForeignKey(
      'railway_services',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Unique composite index on (project_id, railway_service_id)
    await queryRunner.createIndex(
      'railway_services',
      new TableIndex({
        columnNames: ['project_id', 'railway_service_id'],
        isUnique: true,
      }),
    );

    // Index on project_id
    await queryRunner.createIndex(
      'railway_services',
      new TableIndex({
        columnNames: ['project_id'],
      }),
    );

    // Index on workspace_id
    await queryRunner.createIndex(
      'railway_services',
      new TableIndex({
        columnNames: ['workspace_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('railway_services', true);
  }
}
