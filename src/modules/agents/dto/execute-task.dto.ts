import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';

export enum TaskType {
  IMPLEMENT_STORY = 'implement-story',
  FIX_BUG = 'fix-bug',
  WRITE_TESTS = 'write-tests',
  REFACTOR = 'refactor',
}

/**
 * ExecuteTaskDto
 * Story 5.3: Dev Agent Implementation
 *
 * Validation DTO for the execute endpoint
 */
export class ExecuteTaskDto {
  @IsEnum(TaskType, {
    message: `type must be one of: ${Object.values(TaskType).join(', ')}`,
  })
  type!: TaskType;

  @IsOptional()
  @IsString()
  storyId?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];
}
