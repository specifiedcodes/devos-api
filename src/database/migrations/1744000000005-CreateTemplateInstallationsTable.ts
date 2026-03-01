/**
 * Migration: Create template_installations table
 *
 * Story 19-6: Template Installation Flow
 */
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateTemplateInstallationsTable1744000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'template_installations',
        schema: 'public',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'template_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'project_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'variables',
            type: 'jsonb',
            isNullable: false,
            default: "'{}'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: [
              'pending',
              'fetching',
              'processing',
              'creating_repo',
              'pushing',
              'running_scripts',
              'complete',
              'failed',
              'cancelled',
            ],
            default: "'pending'",
          },
          {
            name: 'current_step',
            type: 'enum',
            enum: [
              'initialized',
              'fetching_source',
              'validating_variables',
              'processing_files',
              'creating_repository',
              'pushing_files',
              'creating_project',
              'running_post_install',
              'recording_usage',
              'completed',
            ],
            default: "'initialized'",
          },
          {
            name: 'progress',
            type: 'integer',
            default: 0,
          },
          {
            name: 'error',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'github_repo_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'github_repo_id',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'create_new_repo',
            type: 'boolean',
            default: true,
          },
          {
            name: 'repo_private',
            type: 'boolean',
            default: true,
          },
          {
            name: 'repo_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'skip_post_install',
            type: 'boolean',
            default: false,
          },
          {
            name: 'total_files',
            type: 'integer',
            default: 0,
          },
          {
            name: 'processed_files',
            type: 'integer',
            default: 0,
          },
          {
            name: 'completed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'template_installations',
      new TableIndex({
        name: 'IDX_template_installations_workspace_created',
        columnNames: ['workspace_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'template_installations',
      new TableIndex({
        name: 'IDX_template_installations_template_created',
        columnNames: ['template_id', 'created_at'],
      }),
    );

    await queryRunner.createIndex(
      'template_installations',
      new TableIndex({
        name: 'IDX_template_installations_user_status',
        columnNames: ['user_id', 'status'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'template_installations',
      new TableForeignKey({
        name: 'FK_template_installations_template',
        columnNames: ['template_id'],
        referencedTableName: 'templates',
        referencedSchema: 'public',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'template_installations',
      new TableForeignKey({
        name: 'FK_template_installations_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedSchema: 'public',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'template_installations',
      new TableForeignKey({
        name: 'FK_template_installations_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedSchema: 'public',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'template_installations',
      new TableForeignKey({
        name: 'FK_template_installations_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedSchema: 'public',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('template_installations');
  }
}
