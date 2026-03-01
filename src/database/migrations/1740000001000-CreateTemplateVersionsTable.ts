/**
 * Migration: Create Template Versions Table
 *
 * Story 19-7: Template Versioning
 *
 * Creates the template_versions table for storing historical versions of templates.
 */
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateTemplateVersionsTable1740000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'template_versions',
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
            name: 'version',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'changelog',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'definition',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'is_latest',
            type: 'boolean',
            default: false,
          },
          {
            name: 'download_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'published_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'published_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          {
            name: 'UQ_template_version',
            columnNames: ['template_id', 'version'],
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'template_versions',
      new TableIndex({
        name: 'IDX_template_versions_template_id',
        columnNames: ['template_id'],
      }),
    );

    await queryRunner.createIndex(
      'template_versions',
      new TableIndex({
        name: 'IDX_template_versions_template_latest',
        columnNames: ['template_id', 'is_latest'],
      }),
    );

    await queryRunner.createIndex(
      'template_versions',
      new TableIndex({
        name: 'IDX_template_versions_published_at',
        columnNames: ['published_at'],
      }),
    );

    // Create foreign keys
    await queryRunner.createForeignKey(
      'template_versions',
      new TableForeignKey({
        name: 'FK_template_versions_template',
        columnNames: ['template_id'],
        referencedTableName: 'templates',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'template_versions',
      new TableForeignKey({
        name: 'FK_template_versions_publisher',
        columnNames: ['published_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('template_versions');
  }
}
