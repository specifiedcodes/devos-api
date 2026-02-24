import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

export class CreateRolePermissionsTable1770000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'role_permissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'role_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'resource_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'permission',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'granted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Unique constraint on (role_id, resource_type, permission)
    await queryRunner.createUniqueConstraint(
      'role_permissions',
      new TableUnique({
        name: 'UQ_role_permissions_role_resource_permission',
        columnNames: ['role_id', 'resource_type', 'permission'],
      }),
    );

    // Index on role_id
    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'IDX_role_permissions_role_id',
        columnNames: ['role_id'],
      }),
    );

    // Index on (role_id, resource_type)
    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'IDX_role_permissions_role_resource',
        columnNames: ['role_id', 'resource_type'],
      }),
    );

    // FK: role_id -> custom_roles(id) CASCADE
    await queryRunner.createForeignKey(
      'role_permissions',
      new TableForeignKey({
        name: 'FK_role_permissions_role',
        columnNames: ['role_id'],
        referencedTableName: 'custom_roles',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('role_permissions', 'FK_role_permissions_role');
    await queryRunner.dropIndex('role_permissions', 'IDX_role_permissions_role_resource');
    await queryRunner.dropIndex('role_permissions', 'IDX_role_permissions_role_id');
    await queryRunner.dropUniqueConstraint('role_permissions', 'UQ_role_permissions_role_resource_permission');
    await queryRunner.dropTable('role_permissions');
  }
}
