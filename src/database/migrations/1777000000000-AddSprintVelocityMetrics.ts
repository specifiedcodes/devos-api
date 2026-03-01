import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class AddSprintVelocityMetrics1777000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sprint_metrics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'sprint_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'total_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'completed_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'remaining_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'ideal_remaining',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'stories_completed',
            type: 'integer',
            default: 0,
          },
          {
            name: 'stories_total',
            type: 'integer',
            default: 0,
          },
          {
            name: 'scope_changes',
            type: 'integer',
            default: 0,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'sprint_metrics',
      new TableUnique({
        name: 'UQ_sprint_metrics_sprint_date',
        columnNames: ['sprint_id', 'date'],
      }),
    );

    await queryRunner.createIndex(
      'sprint_metrics',
      new TableIndex({
        name: 'IDX_sprint_metrics_sprint_date',
        columnNames: ['sprint_id', 'date'],
      }),
    );

    await queryRunner.createIndex(
      'sprint_metrics',
      new TableIndex({
        name: 'IDX_sprint_metrics_project',
        columnNames: ['project_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'sprint_metrics',
      new TableForeignKey({
        name: 'FK_sprint_metrics_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'sprint_metrics',
      new TableForeignKey({
        name: 'FK_sprint_metrics_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'sprint_metrics',
      new TableForeignKey({
        name: 'FK_sprint_metrics_sprint',
        columnNames: ['sprint_id'],
        referencedTableName: 'sprints',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'velocity_metrics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'sprint_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'sprint_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'start_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'end_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'planned_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'completed_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'carried_over_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'scope_change_points',
            type: 'integer',
            default: 0,
          },
          {
            name: 'average_cycle_time_hours',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'velocity_metrics',
      new TableIndex({
        name: 'IDX_velocity_metrics_project',
        columnNames: ['project_id'],
      }),
    );

    await queryRunner.createIndex(
      'velocity_metrics',
      new TableIndex({
        name: 'IDX_velocity_metrics_dates',
        columnNames: ['start_date', 'end_date'],
      }),
    );

    await queryRunner.createIndex(
      'velocity_metrics',
      new TableIndex({
        name: 'UQ_velocity_metrics_sprint',
        columnNames: ['sprint_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'velocity_metrics',
      new TableForeignKey({
        name: 'FK_velocity_metrics_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'velocity_metrics',
      new TableForeignKey({
        name: 'FK_velocity_metrics_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'velocity_metrics',
      new TableForeignKey({
        name: 'FK_velocity_metrics_sprint',
        columnNames: ['sprint_id'],
        referencedTableName: 'sprints',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const velocityMetricsTable = await queryRunner.getTable('velocity_metrics');
    if (velocityMetricsTable) {
      for (const fk of velocityMetricsTable.foreignKeys) {
        await queryRunner.dropForeignKey('velocity_metrics', fk);
      }
    }
    await queryRunner.dropTable('velocity_metrics', true);

    const sprintMetricsTable = await queryRunner.getTable('sprint_metrics');
    if (sprintMetricsTable) {
      for (const fk of sprintMetricsTable.foreignKeys) {
        await queryRunner.dropForeignKey('sprint_metrics', fk);
      }
    }
    await queryRunner.dropTable('sprint_metrics', true);
  }
}
