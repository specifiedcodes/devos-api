import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export enum GeoRestrictionMode {
  ALLOWLIST = 'allowlist',
  BLOCKLIST = 'blocklist',
}

@Entity('geo_restrictions')
@Index(['workspaceId'], { unique: true })
export class GeoRestriction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', unique: true })
  @IsUUID()
  workspaceId!: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  /**
   * Mode: 'allowlist' means only selected countries are allowed.
   *        'blocklist' means selected countries are blocked.
   */
  @Column({
    type: 'enum',
    enum: GeoRestrictionMode,
    default: GeoRestrictionMode.BLOCKLIST,
  })
  @IsEnum(GeoRestrictionMode)
  mode!: GeoRestrictionMode;

  /**
   * ISO 3166-1 alpha-2 country codes (e.g., ['US', 'GB', 'DE']).
   * Stored as a PostgreSQL text array.
   */
  @Column({ type: 'text', array: true, default: '{}' })
  @IsArray()
  @ArrayMaxSize(250) // All countries in the world
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'Each country must be a valid ISO 3166-1 alpha-2 code' })
  countries!: string[];

  @Column({ type: 'boolean', default: false, name: 'is_active' })
  @IsBoolean()
  isActive!: boolean;

  /**
   * Whether to log geo-blocked attempts without actually blocking.
   * Used for a "dry run" / monitoring period before enforcement.
   */
  @Column({ type: 'boolean', default: false, name: 'log_only' })
  @IsBoolean()
  logOnly!: boolean;

  @Column({ type: 'uuid', name: 'created_by' })
  @IsUUID()
  createdBy!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @Column({ type: 'uuid', name: 'last_modified_by', nullable: true })
  @IsOptional()
  lastModifiedBy!: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
