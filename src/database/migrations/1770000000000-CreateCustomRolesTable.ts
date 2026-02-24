import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

export class CreateCustomRolesTable1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'custom_roles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'color',
            type: 'varchar',
            length: '7',
            default: "'#6366f1'",
          },
          {
            name: 'icon',
            type: 'varchar',
            length: '50',
            default: "'shield'",
          },
          {
            name: 'base_role',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'is_system',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'priority_order',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_by',
            type: 'uuid',
            isNullable: true,
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

    // Unique constraint on (workspace_id, name)
    await queryRunner.createUniqueConstraint(
      'custom_roles',
      new TableUnique({
        name: 'UQ_custom_roles_workspace_name',
        columnNames: ['workspace_id', 'name'],
      }),
    );

    // Index on workspace_id
    await queryRunner.createIndex(
      'custom_roles',
      new TableIndex({
        name: 'IDX_custom_roles_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    // Index on (workspace_id, is_active)
    await queryRunner.createIndex(
      'custom_roles',
      new TableIndex({
        name: 'IDX_custom_roles_workspace_active',
        columnNames: ['workspace_id', 'is_active'],
      }),
    );

    // Index on created_by
    await queryRunner.createIndex(
      'custom_roles',
      new TableIndex({
        name: 'IDX_custom_roles_created_by',
        columnNames: ['created_by'],
      }),
    );

    // FK: workspace_id -> workspaces(id) CASCADE
    await queryRunner.createForeignKey(
      'custom_roles',
      new TableForeignKey({
        name: 'FK_custom_roles_workspace',
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // FK: created_by -> users(id) SET NULL
    await queryRunner.createForeignKey(
      'custom_roles',
      new TableForeignKey({
        name: 'FK_custom_roles_created_by',
        columnNames: ['created_by'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('custom_roles', 'FK_custom_roles_created_by');
    await queryRunner.dropForeignKey('custom_roles', 'FK_custom_roles_workspace');
    await queryRunner.dropIndex('custom_roles', 'IDX_custom_roles_created_by');
    await queryRunner.dropIndex('custom_roles', 'IDX_custom_roles_workspace_active');
    await queryRunner.dropIndex('custom_roles', 'IDX_custom_roles_workspace_id');
    await queryRunner.dropUniqueConstraint('custom_roles', 'UQ_custom_roles_workspace_name');
    await queryRunner.dropTable('custom_roles');
  }
}
