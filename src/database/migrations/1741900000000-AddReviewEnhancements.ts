import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewEnhancements1741900000000 implements MigrationInterface {
  name = 'AddReviewEnhancements1741900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add publisher reply columns to marketplace_reviews
    await queryRunner.query(`
      ALTER TABLE marketplace_reviews
      ADD COLUMN publisher_reply TEXT,
      ADD COLUMN publisher_reply_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN publisher_reply_by UUID REFERENCES users(id) ON DELETE SET NULL
    `);

    // Create review_votes table
    await queryRunner.query(`
      CREATE TABLE review_votes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        is_helpful BOOLEAN NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_review_votes_review_user UNIQUE (review_id, user_id)
      );
    `);

    // Create indexes for review_votes
    await queryRunner.query(`CREATE INDEX idx_review_votes_review ON review_votes (review_id)`);
    await queryRunner.query(`CREATE INDEX idx_review_votes_user ON review_votes (user_id)`);

    // Create review_reports table
    await queryRunner.query(`
      CREATE TABLE review_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        review_id UUID NOT NULL REFERENCES marketplace_reviews(id) ON DELETE CASCADE,
        reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reason VARCHAR(50) NOT NULL,
        details TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMP WITH TIME ZONE,
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_review_reports_review_reporter UNIQUE (review_id, reporter_user_id),
        CONSTRAINT chk_review_reports_status CHECK (status IN ('pending', 'reviewed', 'dismissed', 'actioned')),
        CONSTRAINT chk_review_reports_reason CHECK (reason IN ('spam', 'inappropriate', 'misleading', 'other'))
      );
    `);

    // Create indexes for review_reports
    await queryRunner.query(`CREATE INDEX idx_review_reports_review ON review_reports (review_id)`);
    await queryRunner.query(`CREATE INDEX idx_review_reports_status ON review_reports (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop review_reports
    await queryRunner.query(`DROP INDEX IF EXISTS idx_review_reports_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_review_reports_review`);
    await queryRunner.query(`DROP TABLE IF EXISTS review_reports`);

    // Drop review_votes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_review_votes_user`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_review_votes_review`);
    await queryRunner.query(`DROP TABLE IF EXISTS review_votes`);

    // Remove publisher reply columns from marketplace_reviews
    await queryRunner.query(`
      ALTER TABLE marketplace_reviews
      DROP COLUMN IF EXISTS publisher_reply_by,
      DROP COLUMN IF EXISTS publisher_reply_at,
      DROP COLUMN IF EXISTS publisher_reply
    `);
  }
}
