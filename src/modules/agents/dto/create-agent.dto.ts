import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsOptional,
  IsUUID,
  IsObject,
} from 'class-validator';
import { AgentType } from '../../../database/entities/agent.entity';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsEnum(AgentType, {
    message: `type must be one of: ${Object.values(AgentType).join(', ')}`,
  })
  type!: AgentType;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
