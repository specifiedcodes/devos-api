import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentType } from '../../../database/entities/agent.entity';

export class CreateAgentDto {
  @ApiProperty({ description: 'Agent name', example: 'dev-agent-1', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Agent type', enum: AgentType })
  @IsEnum(AgentType, {
    message: `type must be one of: ${Object.values(AgentType).join(', ')}`,
  })
  type!: AgentType;

  @ApiPropertyOptional({ description: 'Project ID to associate the agent with', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Agent configuration object', type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
