import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlatformAdminAndSuspensionColumns1739700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'is_platform_admin',
        type: 'boolean',
        default: false,
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'suspended_at',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'suspension_reason',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'suspension_reason');
    await queryRunner.dropColumn('users', 'suspended_at');
    await queryRunner.dropColumn('users', 'is_platform_admin');
  }
}
