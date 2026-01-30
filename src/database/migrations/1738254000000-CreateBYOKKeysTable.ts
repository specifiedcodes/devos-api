import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBYOKKeysTable1738254000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'byok_secrets',
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
            name: 'key_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'provider',
            type: 'enum',
            enum: ['anthropic', 'openai'],
            isNullable: false,
          },
          {
            name: 'encrypted_key',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'encryption_iv',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'created_by_user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
        ],
      }),
      true,
    );

    // Create index for workspace_id + is_active (for fast lookups)
    await queryRunner.createIndex(
      'byok_secrets',
      new TableIndex({
        name: 'IDX_byok_secrets_workspace_active',
        columnNames: ['workspace_id', 'is_active'],
      }),
    );

    // Foreign key to users table
    await queryRunner.query(`
      ALTER TABLE byok_secrets
      ADD CONSTRAINT fk_byok_secrets_created_by
      FOREIGN KEY (created_by_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('byok_secrets');
  }
}
