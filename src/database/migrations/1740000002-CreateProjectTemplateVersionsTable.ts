/**
 * Migration: Create Project Template Versions Table
 *
 * Story 19-7: Template Versioning
 *
 * Creates the project_template_versions table for tracking which template
 * version was used for each project.
 */
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateProjectTemplateVersionsTable1740000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_template_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'template_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'template_version_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'installed_version',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'latest_version',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'update_available',
            type: 'boolean',
            default: false,
          },
          {
            name: 'update_type',
            type: 'enum',
            enum: ['patch', 'minor', 'major'],
            isNullable: true,
          },
          {
            name: 'last_checked_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'dismissed_version',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create unique index on project_id
    await queryRunner.createIndex(
      'project_template_versions',
      new TableIndex({
        name: 'UQ_project_template_versions_project_id',
        columnNames: ['project_id'],
        isUnique: true,
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'project_template_versions',
      new TableIndex({
        name: 'IDX_project_template_versions_template_id',
        columnNames: ['template_id'],
      }),
    );

    await queryRunner.createIndex(
      'project_template_versions',
      new TableIndex({
        name: 'IDX_project_template_versions_update_available',
        columnNames: ['update_available'],
      }),
    );

    await queryRunner.createIndex(
      'project_template_versions',
      new TableIndex({
        name: 'IDX_project_template_versions_last_checked',
        columnNames: ['last_checked_at'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'project_template_versions',
      new TableForeignKey({
        name: 'FK_project_template_versions_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'project_template_versions',
      new TableForeignKey({
        name: 'FK_project_template_versions_template',
        columnNames: ['template_id'],
        referencedTableName: 'templates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'project_template_versions',
      new TableForeignKey({
        name: 'FK_project_template_versions_version',
        columnNames: ['template_version_id'],
        referencedTableName: 'template_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('project_template_versions');
  }
}
