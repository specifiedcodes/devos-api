/**
 * TemplateVersion Entity
 *
 * Story 19-7: Template Versioning
 *
 * Stores historical versions of templates with full definition snapshots.
 * Enables version tracking, changelog management, and update detection.
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
import {
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsInt,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { Template, TemplateDefinitionSpec } from './template.entity';
import { User } from './user.entity';

@Entity('template_versions')
@Unique(['templateId', 'version'])
@Index(['templateId'])
@Index(['templateId', 'isLatest'])
@Index(['publishedAt'])
export class TemplateVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'template_id' })
  @IsNotEmpty()
  @IsUUID()
  templateId!: string;

  @ManyToOne(() => Template, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template!: Template;

  @Column({ type: 'varchar', length: 50 })
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version must follow semver format (e.g., 1.0.0)' })
  version!: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  changelog?: string | null;

  @Column({ type: 'jsonb' })
  @IsNotEmpty()
  definition!: TemplateDefinitionSpec;

  @Column({ type: 'boolean', name: 'is_latest', default: false })
  @IsBoolean()
  isLatest!: boolean;

  @Column({ type: 'integer', name: 'download_count', default: 0 })
  @IsInt()
  @Min(0)
  downloadCount!: number;

  @Column({ type: 'uuid', name: 'published_by', nullable: true })
  @IsOptional()
  @IsUUID()
  publishedBy?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'published_by' })
  publisher?: User | null;

  @Column({ type: 'timestamp with time zone', name: 'published_at' })
  publishedAt!: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;
}
