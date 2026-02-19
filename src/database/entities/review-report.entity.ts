/**
 * ReviewReport Entity
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * Stores reports/flags on marketplace reviews for moderation.
 * One report per user per review (enforced by unique constraint).
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsUUID, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MarketplaceReview } from './marketplace-review.entity';
import { User } from './user.entity';

export enum ReviewReportReason {
  SPAM = 'spam',
  INAPPROPRIATE = 'inappropriate',
  MISLEADING = 'misleading',
  OTHER = 'other',
}

export enum ReviewReportStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  DISMISSED = 'dismissed',
  ACTIONED = 'actioned',
}

@Entity('review_reports')
@Unique(['reviewId', 'reporterUserId'])
@Index(['reviewId'])
@Index(['status'])
export class ReviewReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'review_id' })
  @IsUUID()
  reviewId!: string;

  @ManyToOne(() => MarketplaceReview, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review?: MarketplaceReview;

  @Column({ type: 'uuid', name: 'reporter_user_id' })
  @IsUUID()
  reporterUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_user_id' })
  reporter?: User;

  @Column({ type: 'varchar', length: 50 })
  @IsEnum(ReviewReportReason)
  reason!: ReviewReportReason;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: ReviewReportStatus.PENDING,
  })
  @IsEnum(ReviewReportStatus)
  status!: ReviewReportStatus;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'reviewed_at' })
  reviewedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  @IsUUID()
  @IsOptional()
  reviewedBy!: string | null;
}
