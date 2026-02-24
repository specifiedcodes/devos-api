import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTemplateIdToCustomRoles1770000000007
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'custom_roles',
      new TableColumn({
        name: 'template_id',
        type: 'varchar',
        length: '50',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('custom_roles', 'template_id');
  }
}
