/**
 * Migration: Create Template Reviews Table
 *
 * Story 19-5: Template Rating & Reviews
 */
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableUnique } from 'typeorm';

export class CreateTemplateReviewsTable1744000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create template_reviews table
    await queryRunner.createTable(
      new Table({
        name: 'template_reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'template_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'rating',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'body',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            default: "'{}'",
          },
          {
            name: 'helpful_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'is_verified_use',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Add unique constraint for one review per user per template
    await queryRunner.createUniqueConstraint(
      'template_reviews',
      new TableUnique({
        name: 'UQ_template_reviews_template_user',
        columnNames: ['template_id', 'user_id'],
      }),
    );

    // Add indexes
    await queryRunner.createIndex(
      'template_reviews',
      new TableIndex({
        name: 'idx_template_reviews_template_id',
        columnNames: ['template_id'],
      }),
    );

    await queryRunner.createIndex(
      'template_reviews',
      new TableIndex({
        name: 'idx_template_reviews_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'template_reviews',
      new TableIndex({
        name: 'idx_template_reviews_created_at',
        columnNames: ['created_at'],
      }),
    );

    // Add foreign key to templates table
    await queryRunner.createForeignKey(
      'template_reviews',
      new TableForeignKey({
        name: 'FK_template_reviews_template',
        columnNames: ['template_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'templates',
        onDelete: 'CASCADE',
      }),
    );

    // Add foreign key to users table
    await queryRunner.createForeignKey(
      'template_reviews',
      new TableForeignKey({
        name: 'FK_template_reviews_user',
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.dropForeignKey('template_reviews', 'FK_template_reviews_user');
    await queryRunner.dropForeignKey('template_reviews', 'FK_template_reviews_template');

    // Drop indexes
    await queryRunner.dropIndex('template_reviews', 'idx_template_reviews_created_at');
    await queryRunner.dropIndex('template_reviews', 'idx_template_reviews_user_id');
    await queryRunner.dropIndex('template_reviews', 'idx_template_reviews_template_id');

    // Drop unique constraint
    await queryRunner.dropUniqueConstraint('template_reviews', 'UQ_template_reviews_template_user');

    // Drop table
    await queryRunner.dropTable('template_reviews');
  }
}
