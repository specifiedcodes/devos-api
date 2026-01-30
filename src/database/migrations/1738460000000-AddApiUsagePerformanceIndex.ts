import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add composite index for usage export performance
 * Story 3.6: Usage Reports Export
 *
 * This index optimizes queries filtering by workspace_id and created_at
 * which are used in CSV export date range queries
 */
export class AddApiUsagePerformanceIndex1738460000000
  implements MigrationInterface
{
  name = 'AddApiUsagePerformanceIndex1738460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add composite index on (workspace_id, created_at) for fast date range queries
    await queryRunner.query(
      `CREATE INDEX "idx_api_usage_workspace_date" ON "api_usage" ("workspace_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the index
    await queryRunner.query(
      `DROP INDEX "idx_api_usage_workspace_date"`,
    );
  }
}
