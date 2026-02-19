/**
 * MarketplaceReview Entity
 *
 * Story 18-5: Agent Marketplace Backend
 * Story 18-7: Agent Rating & Reviews (publisher reply support)
 *
 * User reviews for marketplace agents.
 * One review per user per agent (enforced by unique constraint).
 */
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { IsNotEmpty, IsUUID, IsInt, Min, Max, MaxLength, IsOptional, IsString } from 'class-validator';
import { MarketplaceAgent } from './marketplace-agent.entity';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

@Entity('marketplace_reviews')
@Unique(['marketplaceAgentId', 'reviewerUserId'])
@Index(['marketplaceAgentId'])
@Index(['reviewerUserId'])
@Index(['rating'])
export class MarketplaceReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'marketplace_agent_id' })
  @IsUUID()
  marketplaceAgentId!: string;

  @ManyToOne(() => MarketplaceAgent, (agent) => agent.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'marketplace_agent_id' })
  marketplaceAgent?: MarketplaceAgent;

  @Column({ type: 'uuid', name: 'reviewer_user_id' })
  @IsUUID()
  reviewerUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewer?: User;

  @Column({ type: 'uuid', name: 'reviewer_workspace_id' })
  @IsUUID()
  reviewerWorkspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_workspace_id' })
  reviewerWorkspace?: Workspace;

  @Column({ type: 'int' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'version_reviewed' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  versionReviewed!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  // ---- Publisher Reply (Story 18-7) ----

  @Column({ type: 'text', nullable: true, name: 'publisher_reply' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  publisherReply!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'publisher_reply_at' })
  publisherReplyAt!: Date | null;

  @Column({ type: 'uuid', nullable: true, name: 'publisher_reply_by' })
  @IsUUID()
  @IsOptional()
  publisherReplyBy!: string | null;
}
