import {
  IsString,
  IsOptional,
  IsUUID,
  IsInt,
  IsDateString,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { SprintStatus } from '../../../database/entities/sprint.entity';

/**
 * DTO for creating a new sprint
 */
export class CreateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;
}

/**
 * DTO for updating a sprint
 */
export class UpdateSprintDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;
}

/**
 * DTO for starting a sprint
 */
export class StartSprintDto {
  @IsNotEmpty()
  @IsDateString()
  startDate!: string;

  @IsNotEmpty()
  @IsDateString()
  endDate!: string;
}

/**
 * DTO for adding a story to a sprint
 */
export class AddStoryToSprintDto {
  @IsNotEmpty()
  @IsUUID()
  storyId!: string;
}

/**
 * Response DTO for a single sprint
 */
export class SprintResponseDto {
  id!: string;
  projectId!: string;
  sprintNumber!: number;
  name!: string;
  goal?: string;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  status!: SprintStatus;
  completedAt?: string;
  storyCount!: number;
  completedStoryCount!: number;
  totalPoints!: number;
  completedPoints!: number;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * Response DTO for sprint list
 */
export class SprintListResponseDto {
  sprints!: SprintResponseDto[];
  total!: number;
}
