import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({ description: 'Task type to execute', enum: TaskType })
  @IsEnum(TaskType, {
    message: `type must be one of: ${Object.values(TaskType).join(', ')}`,
  })
  type!: TaskType;

  @ApiPropertyOptional({ description: 'Story ID to associate the task with', format: 'uuid' })
  @IsOptional()
  @IsString()
  storyId?: string;

  @ApiProperty({ description: 'Task description', example: 'Implement login endpoint with JWT' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'List of file paths relevant to the task', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  files?: string[];

  @ApiPropertyOptional({ description: 'Additional requirements or constraints', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];
}
