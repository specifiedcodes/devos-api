/**
 * ReviewVote Entity
 *
 * Story 18-7: Agent Rating & Reviews
 *
 * Stores helpful/not helpful votes on marketplace reviews.
 * One vote per user per review (enforced by unique constraint).
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
import { IsUUID, IsBoolean } from 'class-validator';
import { MarketplaceReview } from './marketplace-review.entity';
import { User } from './user.entity';

@Entity('review_votes')
@Unique(['reviewId', 'userId'])
@Index(['reviewId'])
@Index(['userId'])
export class ReviewVote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'review_id' })
  @IsUUID()
  reviewId!: string;

  @ManyToOne(() => MarketplaceReview, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'review_id' })
  review?: MarketplaceReview;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'boolean', name: 'is_helpful' })
  @IsBoolean()
  isHelpful!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
