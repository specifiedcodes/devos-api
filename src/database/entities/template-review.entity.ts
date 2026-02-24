/**
 * Template Review Entity
 *
 * Story 19-5: Template Rating & Reviews
 *
 * Allows users to rate and review templates they have used.
 * One review per user per template (unique constraint).
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
import {
  IsNotEmpty,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsArray,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Template } from './template.entity';
import { User } from './user.entity';

@Entity('template_reviews')
@Unique(['templateId', 'userId']) // One review per user per template
@Index('idx_template_reviews_template_id', ['templateId'])
@Index('idx_template_reviews_user_id', ['userId'])
@Index('idx_template_reviews_created_at', ['createdAt'])
export class TemplateReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'template_id' })
  @IsUUID()
  @IsNotEmpty()
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template?: Template;

  @Column({ type: 'uuid', name: 'user_id' })
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'int' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number; // 1-5 stars

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @Column({ type: 'text' })
  @IsNotEmpty()
  @MinLength(50, { message: 'Review must be at least 50 characters' })
  @MaxLength(5000, { message: 'Review must not exceed 5000 characters' })
  body!: string;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  @IsArray()
  @IsOptional()
  tags?: string[]; // e.g., ["Well Documented", "Easy to Customize", "Production Ready"]

  @Column({ type: 'int', name: 'helpful_count', default: 0 })
  @IsInt()
  @Min(0)
  helpfulCount!: number;

  @Column({ type: 'boolean', name: 'is_verified_use', default: false })
  @IsBoolean()
  isVerifiedUse!: boolean; // True if user actually used the template

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;
}
