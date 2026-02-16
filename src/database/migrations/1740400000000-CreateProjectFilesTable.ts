import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * CreateProjectFilesTable Migration
 * Story 16.2: File Upload/Download API (AC2)
 *
 * Creates project_files table with indexes and foreign keys
 * for workspace-scoped file management.
 */
export class CreateProjectFilesTable1740400000000 implements MigrationInterface {
  name = 'CreateProjectFilesTable1740400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_files',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'project_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'filename',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'path',
            type: 'varchar',
            length: '1000',
            isNullable: false,
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'size_bytes',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'uploaded_by',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Foreign keys
    await queryRunner.createForeignKey(
      'project_files',
      new TableForeignKey({
        name: 'FK_project_files_project',
        columnNames: ['project_id'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'project_files',
      new TableForeignKey({
        name: 'FK_project_files_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'project_files',
      new TableForeignKey({
        name: 'FK_project_files_uploaded_by',
        columnNames: ['uploaded_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Unique partial index: prevent duplicate filenames in same path (active files only)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_project_files_unique_path"
        ON "project_files" ("project_id", "path", "filename")
        WHERE "deleted_at" IS NULL
    `);

    // Additional indexes
    await queryRunner.createIndex(
      'project_files',
      new TableIndex({
        name: 'idx_project_files_workspace',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'project_files',
      new TableIndex({
        name: 'idx_project_files_project',
        columnNames: ['project_id'],
      }),
    );

    await queryRunner.createIndex(
      'project_files',
      new TableIndex({
        name: 'idx_project_files_uploaded_by',
        columnNames: ['uploaded_by'],
      }),
    );

    await queryRunner.createIndex(
      'project_files',
      new TableIndex({
        name: 'idx_project_files_mime_type',
        columnNames: ['mime_type'],
      }),
    );

    await queryRunner.createIndex(
      'project_files',
      new TableIndex({
        name: 'idx_project_files_deleted_at',
        columnNames: ['deleted_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('project_files', 'idx_project_files_deleted_at');
    await queryRunner.dropIndex('project_files', 'idx_project_files_mime_type');
    await queryRunner.dropIndex('project_files', 'idx_project_files_uploaded_by');
    await queryRunner.dropIndex('project_files', 'idx_project_files_project');
    await queryRunner.dropIndex('project_files', 'idx_project_files_workspace');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_project_files_unique_path"');
    await queryRunner.dropForeignKey('project_files', 'FK_project_files_uploaded_by');
    await queryRunner.dropForeignKey('project_files', 'FK_project_files_workspace');
    await queryRunner.dropForeignKey('project_files', 'FK_project_files_project');
    await queryRunner.dropTable('project_files');
  }
}
