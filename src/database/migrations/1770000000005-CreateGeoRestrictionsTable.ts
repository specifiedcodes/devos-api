import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateGeoRestrictionsTable1770000000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for geo restriction mode
    await queryRunner.query(`CREATE TYPE "geo_restriction_mode_enum" AS ENUM('allowlist', 'blocklist')`);

    await queryRunner.createTable(
      new Table({
        name: 'geo_restrictions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'workspace_id', type: 'uuid', isUnique: true },
          { name: 'mode', type: 'geo_restriction_mode_enum', default: `'blocklist'` },
          { name: 'countries', type: 'text', isArray: true, default: `'{}'` },
          { name: 'is_active', type: 'boolean', default: false },
          { name: 'log_only', type: 'boolean', default: false },
          { name: 'created_by', type: 'uuid' },
          { name: 'last_modified_by', type: 'uuid', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'geo_restrictions',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'geo_restrictions',
      new TableForeignKey({
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('geo_restrictions', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "geo_restriction_mode_enum"`);
  }
}
