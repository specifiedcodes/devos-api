import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddKeyPrefixSuffixToBYOKKeys1738450000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add key_prefix column
    await queryRunner.addColumn(
      'byok_secrets',
      new TableColumn({
        name: 'key_prefix',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
    );

    // Add key_suffix column
    await queryRunner.addColumn(
      'byok_secrets',
      new TableColumn({
        name: 'key_suffix',
        type: 'varchar',
        length: '4',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('byok_secrets', 'key_suffix');
    await queryRunner.dropColumn('byok_secrets', 'key_prefix');
  }
}
