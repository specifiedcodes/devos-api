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
import { StoryStatus, StoryPriority } from '../../../database/entities/story.entity';

/**
 * DTO for creating a new story
 */
export class CreateStoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  storyKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  epicId?: string;

  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO for query parameters when listing stories
 */
export class StoryListQueryDto {
  @IsOptional()
  @IsUUID()
  epicId?: string;

  @IsOptional()
  @IsEnum(StoryStatus)
  status?: StoryStatus;

  @IsOptional()
  @IsUUID()
  assignedAgentId?: string;

  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

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
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(StoryPriority)
  priority?: StoryPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/**
 * DTO for updating a story's status
 */
export class UpdateStoryStatusDto {
  @IsNotEmpty()
  @IsEnum(StoryStatus)
  status!: StoryStatus;
}

/**
 * DTO for assigning/unassigning an agent to a story
 */
export class AssignStoryDto {
  @IsOptional()
  @IsUUID()
  assignedAgentId?: string | null;
}

/**
 * Response DTO for a single story
 */
export class StoryResponseDto {
  id!: string;
  projectId!: string;
  epicId?: string;
  sprintId?: string;
  storyKey!: string;
  title!: string;
  description?: string;
  status!: StoryStatus;
  priority!: StoryPriority;
  storyPoints?: number;
  position!: number;
  tags?: string[];
  assignedAgentId?: string;
  assignedAgent?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Response DTO for paginated story list
 */
export class StoryListResponseDto {
  stories!: StoryResponseDto[];
  total!: number;
  page!: number;
  perPage!: number;
}
