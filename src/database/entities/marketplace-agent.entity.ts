/**
 * MarketplaceAgent Entity
 *
 * Story 18-5: Agent Marketplace Backend
 *
 * Represents a published agent in the marketplace.
 * Stored in public schema for cross-workspace access.
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
  OneToMany,
} from 'typeorm';
import { IsNotEmpty, IsOptional, IsBoolean, IsUUID, MaxLength, IsEnum, IsInt, Min, IsUrl, IsArray, Max } from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { AgentDefinition } from './agent-definition.entity';
import { MarketplaceReview } from './marketplace-review.entity';

export enum MarketplaceAgentCategory {
  DEVELOPMENT = 'development',
  QA = 'qa',
  DEVOPS = 'devops',
  DOCUMENTATION = 'documentation',
  PRODUCTIVITY = 'productivity',
  SECURITY = 'security',
}

export enum MarketplacePricingType {
  FREE = 'free',
  PAID = 'paid',
  FREEMIUM = 'freemium',
}

export enum MarketplaceAgentStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  SUSPENDED = 'suspended',
}

@Entity('marketplace_agents')
@Index(['name'], { unique: true })
@Index(['category'])
@Index(['publisherUserId'])
@Index(['status'])
@Index(['isFeatured'])
@Index(['pricingType'])
@Index(['avgRating'])
@Index(['totalInstalls'])
export class MarketplaceAgent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'agent_definition_id' })
  @IsUUID()
  agentDefinitionId!: string;

  @ManyToOne(() => AgentDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agent_definition_id' })
  agentDefinition?: AgentDefinition;

  @Column({ type: 'uuid', name: 'publisher_user_id' })
  @IsUUID()
  publisherUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'publisher_user_id' })
  publisher?: User;

  @Column({ type: 'uuid', name: 'publisher_workspace_id' })
  @IsUUID()
  publisherWorkspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'publisher_workspace_id' })
  publisherWorkspace?: Workspace;

  @Column({ type: 'varchar', length: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  name!: string; // Unique slug for marketplace URL

  @Column({ type: 'varchar', length: 255, name: 'display_name' })
  @IsNotEmpty()
  @MaxLength(255)
  displayName!: string;

  @Column({ type: 'varchar', length: 200, name: 'short_description' })
  @IsNotEmpty()
  @MaxLength(200)
  shortDescription!: string;

  @Column({ type: 'text', name: 'long_description' })
  @IsNotEmpty()
  longDescription!: string; // Markdown supported

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  category!: MarketplaceAgentCategory;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  @IsArray()
  tags!: string[];

  @Column({ type: 'varchar', length: 255, name: 'icon_url', nullable: true })
  @IsOptional()
  @IsUrl()
  iconUrl!: string | null;

  @Column({ type: 'text', array: true, name: 'screenshots', default: () => "'{}'" })
  @IsArray()
  screenshots!: string[];

  @Column({ type: 'varchar', length: 50, name: 'latest_version', default: '1.0.0' })
  @IsNotEmpty()
  latestVersion!: string;

  @Column({ type: 'int', name: 'total_installs', default: 0 })
  @IsInt()
  @Min(0)
  totalInstalls!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, name: 'avg_rating', default: 0 })
  @Min(0)
  @Max(5)
  avgRating!: number;

  @Column({ type: 'int', name: 'rating_count', default: 0 })
  @IsInt()
  @Min(0)
  ratingCount!: number;

  @Column({ type: 'boolean', name: 'is_featured', default: false })
  @IsBoolean()
  isFeatured!: boolean;

  @Column({ type: 'boolean', name: 'is_verified', default: false })
  @IsBoolean()
  isVerified!: boolean;

  @Column({ type: 'varchar', length: 20, name: 'pricing_type', default: MarketplacePricingType.FREE })
  @IsEnum(MarketplacePricingType)
  pricingType!: MarketplacePricingType;

  @Column({ type: 'int', name: 'price_cents', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents!: number | null;

  @Column({ type: 'varchar', length: 20, default: MarketplaceAgentStatus.DRAFT })
  @IsEnum(MarketplaceAgentStatus)
  status!: MarketplaceAgentStatus;

  @Column({ type: 'timestamp with time zone', name: 'published_at', nullable: true })
  publishedAt!: Date | null;

  @OneToMany(() => MarketplaceReview, (review) => review.marketplaceAgent)
  reviews?: MarketplaceReview[];

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
