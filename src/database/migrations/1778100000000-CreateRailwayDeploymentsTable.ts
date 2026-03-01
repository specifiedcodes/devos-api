import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateRailwayDeploymentsTable1778100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'railway_deployments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'railway_service_entity_id',
            type: 'uuid',
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
            name: 'railway_deployment_id',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['queued', 'building', 'deploying', 'success', 'failed', 'crashed', 'cancelled', 'rolled_back'],
          },
          {
            name: 'deployment_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'commit_sha',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'branch',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'triggered_by',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'trigger_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'build_duration_seconds',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'deploy_duration_seconds',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'meta',
            type: 'jsonb',
            default: "'{}'",
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

    // Foreign key: railway_service_entity_id -> railway_services(id) ON DELETE CASCADE
    await queryRunner.createForeignKey(
      'railway_deployments',
      new TableForeignKey({
        columnNames: ['railway_service_entity_id'],
        referencedTableName: 'railway_services',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Composite index on (railway_service_entity_id, created_at) for deployment history queries
    await queryRunner.createIndex(
      'railway_deployments',
      new TableIndex({
        columnNames: ['railway_service_entity_id', 'created_at'],
      }),
    );

    // Index on project_id
    await queryRunner.createIndex(
      'railway_deployments',
      new TableIndex({
        columnNames: ['project_id'],
      }),
    );

    // Index on workspace_id
    await queryRunner.createIndex(
      'railway_deployments',
      new TableIndex({
        columnNames: ['workspace_id'],
      }),
    );

    // Index on status
    await queryRunner.createIndex(
      'railway_deployments',
      new TableIndex({
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('railway_deployments', true);
  }
}
