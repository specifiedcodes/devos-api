import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * CreateAuditSavedSearches Migration
 * Story 14.10: Audit Log Viewer (AC7)
 *
 * Creates audit_saved_searches table for storing admin saved search configurations.
 */
export class CreateAuditSavedSearches1740300000000 implements MigrationInterface {
  name = 'CreateAuditSavedSearches1740300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_saved_searches',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'created_by',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'filters',
            type: 'jsonb',
          },
          {
            name: 'is_shared',
            type: 'boolean',
            default: false,
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

    await queryRunner.createIndex(
      'audit_saved_searches',
      new TableIndex({
        name: 'IDX_audit_saved_searches_created_by',
        columnNames: ['created_by'],
      }),
    );

    await queryRunner.createIndex(
      'audit_saved_searches',
      new TableIndex({
        name: 'IDX_audit_saved_searches_is_shared',
        columnNames: ['is_shared'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('audit_saved_searches', 'IDX_audit_saved_searches_is_shared');
    await queryRunner.dropIndex('audit_saved_searches', 'IDX_audit_saved_searches_created_by');
    await queryRunner.dropTable('audit_saved_searches');
  }
}
