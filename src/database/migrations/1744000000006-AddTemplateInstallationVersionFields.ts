/**
 * Migration: Add Version Fields to Template Installations
 *
 * Story 19-7: Template Versioning
 *
 * Adds installed_version and template_version_id columns to template_installations.
 */
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddTemplateInstallationVersionFields1744000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add installed_version column
    await queryRunner.addColumn(
      'template_installations',
      new TableColumn({
        name: 'installed_version',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );

    // Add template_version_id column
    await queryRunner.addColumn(
      'template_installations',
      new TableColumn({
        name: 'template_version_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Create foreign key to template_versions
    await queryRunner.createForeignKey(
      'template_installations',
      new TableForeignKey({
        name: 'FK_template_installations_version',
        columnNames: ['template_version_id'],
        referencedTableName: 'template_versions',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key first
    await queryRunner.dropForeignKey('template_installations', 'FK_template_installations_version');

    // Drop columns
    await queryRunner.dropColumn('template_installations', 'template_version_id');
    await queryRunner.dropColumn('template_installations', 'installed_version');
  }
}
