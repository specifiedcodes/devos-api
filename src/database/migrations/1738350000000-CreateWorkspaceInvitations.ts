import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
  TableForeignKey,
} from 'typeorm';

export class CreateWorkspaceInvitations1738350000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create workspace_invitations table
    await queryRunner.createTable(
      new Table({
        name: 'workspace_invitations',
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
            name: 'email',
            type: 'varchar',
            length: '255',
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
            name: 'inviter_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'token',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'accepted', 'revoked', 'expired'],
            default: "'pending'",
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

    // Create indexes
    await queryRunner.createIndex(
      'workspace_invitations',
      new TableIndex({
        name: 'idx_workspace_invitations_workspace_id',
        columnNames: ['workspace_id'],
      }),
    );

    await queryRunner.createIndex(
      'workspace_invitations',
      new TableIndex({
        name: 'idx_workspace_invitations_email',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'workspace_invitations',
      new TableIndex({
        name: 'idx_workspace_invitations_token',
        columnNames: ['token'],
        isUnique: true,
      }),
    );

    // Compound index to prevent duplicate pending invitations
    await queryRunner.createIndex(
      'workspace_invitations',
      new TableIndex({
        name: 'idx_workspace_invitations_workspace_email_status',
        columnNames: ['workspace_id', 'email', 'status'],
      }),
    );

    // Foreign keys
    await queryRunner.createForeignKey(
      'workspace_invitations',
      new TableForeignKey({
        columnNames: ['workspace_id'],
        referencedTableName: 'workspaces',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'workspace_invitations',
      new TableForeignKey({
        columnNames: ['inviter_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('workspace_invitations');
    if (table) {
      const foreignKeys = table.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('workspace_invitations', foreignKey);
      }
    }

    await queryRunner.dropTable('workspace_invitations');
  }
}
