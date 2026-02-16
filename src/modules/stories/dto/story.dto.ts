import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StoryStatus, StoryPriority } from '../../../database/entities/story.entity';

/**
 * DTO for creating a new story
 */
export class CreateStoryDto {
  @ApiProperty({ description: 'Unique story key within the project', example: 'PROJ-42', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  storyKey!: string;

  @ApiProperty({ description: 'Story title', example: 'Implement user authentication', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ description: 'Detailed story description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Epic ID this story belongs to', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  epicId?: string;

  @ApiPropertyOptional({ description: 'Story priority', enum: StoryPriority })
  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @ApiPropertyOptional({ description: 'Story points estimate', minimum: 1, maximum: 100, example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @ApiPropertyOptional({ description: 'Tags for categorization', type: [String], example: ['backend', 'auth'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO for query parameters when listing stories
 */
export class StoryListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by epic ID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  epicId?: string;

  @ApiPropertyOptional({ description: 'Filter by story status', enum: StoryStatus })
  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;

  @ApiPropertyOptional({ description: 'Filter by assigned agent ID', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedAgentId?: string;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: StoryPriority })
  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 100, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  perPage?: number = 100;
}

/**
 * DTO for updating a story's fields
 */
export class UpdateStoryDto {
  @ApiPropertyOptional({ description: 'Updated story title', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated story description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Updated priority', enum: StoryPriority })
  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @ApiPropertyOptional({ description: 'Updated story points', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @ApiPropertyOptional({ description: 'Updated tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO for updating a story's status
 */
export class UpdateStoryStatusDto {
  @ApiProperty({ description: 'New story status', enum: StoryStatus })
  @IsNotEmpty()
  @IsEnum(StoryStatus)
  status!: StoryStatus;
}

/**
 * DTO for assigning/unassigning an agent to a story
 */
export class AssignStoryDto {
  @ApiPropertyOptional({ description: 'Agent ID to assign (null to unassign)', format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  assignedAgentId?: string | null;
}

/**
 * Response DTO for a single story
 */
export class StoryResponseDto {
  @ApiProperty({ description: 'Story ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Project ID', format: 'uuid' })
  projectId!: string;

  @ApiPropertyOptional({ description: 'Epic ID', format: 'uuid' })
  epicId?: string;

  @ApiPropertyOptional({ description: 'Sprint ID', format: 'uuid' })
  sprintId?: string;

  @ApiProperty({ description: 'Story key', example: 'PROJ-42' })
  storyKey!: string;

  @ApiProperty({ description: 'Story title' })
  title!: string;

  @ApiPropertyOptional({ description: 'Story description' })
  description?: string;

  @ApiProperty({ description: 'Story status', enum: StoryStatus })
  status!: StoryStatus;

  @ApiProperty({ description: 'Story priority', enum: StoryPriority })
  priority!: StoryPriority;

  @ApiPropertyOptional({ description: 'Story points estimate' })
  storyPoints?: number;

  @ApiProperty({ description: 'Position in backlog/sprint' })
  position!: number;

  @ApiPropertyOptional({ description: 'Tags', type: [String] })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Assigned agent ID', format: 'uuid' })
  assignedAgentId?: string;

  @ApiPropertyOptional({ description: 'Assigned agent details' })
  assignedAgent?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last updated timestamp' })
  updatedAt!: Date;
}

/**
 * Response DTO for paginated story list
 */
export class StoryListResponseDto {
  @ApiProperty({ description: 'List of stories', type: [StoryResponseDto] })
  stories!: StoryResponseDto[];

  @ApiProperty({ description: 'Total number of stories matching filters' })
  total!: number;

  @ApiProperty({ description: 'Current page number' })
  page!: number;

  @ApiProperty({ description: 'Items per page' })
  perPage!: number;
}
