import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class InitialSchema1738184400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension FIRST before creating any tables (Fix Issue #7)
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create users table
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'two_factor_secret',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'two_factor_enabled',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'last_login_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create workspaces table
    await queryRunner.createTable(
      new Table({
        name: 'workspaces',
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
            length: '255',
            isNullable: false,
          },
          {
            name: 'owner_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'schema_name',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create workspace_members table
    await queryRunner.createTable(
      new Table({
        name: 'workspace_members',
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
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['owner', 'admin', 'developer', 'viewer'],
            default: "'developer'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Add foreign key: workspaces.owner_user_id -> users.id
    await queryRunner.createForeignKey(
      'workspaces',
      new TableForeignKey({
        columnNames: ['owner_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key: workspace_members.workspace_id -> workspaces.id
    await queryRunner.createForeignKey(
      'workspace_members',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key: workspace_members.user_id -> users.id
    await queryRunner.createForeignKey(
      'workspace_members',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Add composite index on workspace_members (workspace_id, user_id) for performance (Fix Issue #5)
    await queryRunner.query(
      'CREATE INDEX "idx_workspace_members_workspace_user" ON "workspace_members" ("workspace_id", "user_id")',
    );

    // Create function to automatically update updated_at timestamp (Fix Issue #6)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // Add trigger to users table for updated_at
    await queryRunner.query(`
      CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);

    // Add trigger to workspaces table for updated_at
    await queryRunner.query(`
      CREATE TRIGGER update_workspaces_updated_at
      BEFORE UPDATE ON workspaces
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers first
    await queryRunner.query('DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces');
    await queryRunner.query('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
    await queryRunner.query('DROP FUNCTION IF EXISTS update_updated_at_column()');

    // Drop composite index
    await queryRunner.query('DROP INDEX IF EXISTS "idx_workspace_members_workspace_user"');

    // Drop foreign keys
    const workspaceMembersTable = await queryRunner.getTable('workspace_members');
    if (workspaceMembersTable) {
      const workspaceFk = workspaceMembersTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('workspace_id') !== -1,
      );
      const userFk = workspaceMembersTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('user_id') !== -1,
      );
      if (workspaceFk) await queryRunner.dropForeignKey('workspace_members', workspaceFk);
      if (userFk) await queryRunner.dropForeignKey('workspace_members', userFk);
    }

    const workspacesTable = await queryRunner.getTable('workspaces');
    if (workspacesTable) {
      const ownerFk = workspacesTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('owner_user_id') !== -1,
      );
      if (ownerFk) await queryRunner.dropForeignKey('workspaces', ownerFk);
    }

    // Drop tables
    await queryRunner.dropTable('workspace_members', true);
    await queryRunner.dropTable('workspaces', true);
    await queryRunner.dropTable('users', true);
  }
}
