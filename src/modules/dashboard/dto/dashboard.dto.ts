import { IsString, IsNumber, IsOptional, IsEnum, IsObject, Min, Max, IsUUID } from 'class-validator';
import { AgentType, AgentStatus } from '../../agents/enums/agent.enums';

export class AgentStatusDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsEnum(AgentType)
  type: AgentType;

  @IsEnum(AgentStatus)
  status: AgentStatus;

  @IsOptional()
  @IsString()
  currentTask?: string;
}

export class QuickStatsDto {
  @IsNumber()
  @Min(0)
  storiesCompletedToday: number;

  @IsNumber()
  @Min(0)
  deployments: number;

  @IsNumber()
  @Min(0)
  costs: number;
}

export class ActiveProjectDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  sprintProgress: number;
}

export class DashboardStatsDto {
  activeProject: ActiveProjectDto | null;

  @IsObject({ each: true })
  agentStats: AgentStatusDto[];

  quickStats: QuickStatsDto;
}

export class ActivityFeedItemDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  message: string;

  @IsString()
  timestamp: string;

  @IsObject()
  metadata: Record<string, any>;
}
