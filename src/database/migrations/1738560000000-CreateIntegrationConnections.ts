import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
  TableUnique,
} from 'typeorm';

export class CreateIntegrationConnections1738560000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create integration_provider enum type
    await queryRunner.query(
      `CREATE TYPE "integration_provider_enum" AS ENUM ('github', 'railway', 'vercel', 'supabase')`,
    );

    // Create integration_status enum type
    await queryRunner.query(
      `CREATE TYPE "integration_status_enum" AS ENUM ('active', 'disconnected', 'expired', 'error')`,
    );

    // Create integration_connections table
    await queryRunner.createTable(
      new Table({
        name: 'integration_connections',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
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
            name: 'provider',
            type: 'integration_provider_enum',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'integration_status_enum',
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'encrypted_access_token',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'encryption_iv',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'token_type',
            type: 'varchar',
            length: '50',
            default: "'bearer'",
            isNullable: false,
          },
          {
            name: 'scopes',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'external_user_id',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'external_username',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'external_avatar_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'connected_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
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

    // Create unique composite index on (workspace_id, provider)
    await queryRunner.createIndex(
      'integration_connections',
      new TableIndex({
        name: 'idx_integration_connections_workspace_provider_unique',
        columnNames: ['workspace_id', 'provider'],
        isUnique: true,
      }),
    );

    // Create index on workspace_id
    await queryRunner.createIndex(
      'integration_connections',
      new TableIndex({
        name: 'idx_integration_connections_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    // Create index on user_id
    await queryRunner.createIndex(
      'integration_connections',
      new TableIndex({
        name: 'idx_integration_connections_user_id',
        columnNames: ['user_id'],
      }),
    );

    // Foreign key to workspaces table
    await queryRunner.createForeignKey(
      'integration_connections',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Foreign key to users table
    await queryRunner.createForeignKey(
      'integration_connections',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('integration_connections');
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('integration_connections', foreignKey);
      }
    }

    await queryRunner.dropTable('integration_connections');

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "integration_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "integration_provider_enum"`);
  }
}
