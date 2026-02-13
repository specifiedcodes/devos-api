import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentActivityStatus, StatusUpdateCategory } from '../enums/agent-activity-status.enum';
import { AgentType, AgentStatus } from '../../../database/entities/agent.entity';

/**
 * Current status response
 * Story 9.3: Agent Status Updates
 */
export class CurrentStatusDto {
  @ApiProperty({
    description: 'Current activity status',
    enum: AgentActivityStatus,
    example: AgentActivityStatus.CODING,
  })
  activityStatus!: AgentActivityStatus | null;

  @ApiPropertyOptional({
    description: 'Human-readable status message',
    example: 'Working on user-auth.ts',
  })
  message!: string | null;

  @ApiPropertyOptional({
    description: 'When the status was set (ISO string)',
    example: '2026-02-13T14:30:00.000Z',
  })
  since!: string | null;
}

/**
 * Agent info included in status response
 */
export class AgentInfoDto {
  @ApiProperty({
    description: 'Agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  id!: string;

  @ApiProperty({
    description: 'Agent name',
    example: 'Dev Agent',
  })
  name!: string;

  @ApiProperty({
    description: 'Agent type',
    enum: AgentType,
    example: AgentType.DEV,
  })
  type!: AgentType;

  @ApiProperty({
    description: 'Agent lifecycle status',
    enum: AgentStatus,
    example: AgentStatus.RUNNING,
  })
  status!: AgentStatus;
}

/**
 * Response for GET /agents/:agentId/status
 */
export class GetAgentStatusResponseDto {
  @ApiProperty({
    description: 'Current activity status information',
    type: CurrentStatusDto,
  })
  currentStatus!: CurrentStatusDto;

  @ApiProperty({
    description: 'Agent information',
    type: AgentInfoDto,
  })
  agent!: AgentInfoDto;
}

/**
 * Status update record in history response
 */
export class StatusUpdateRecordDto {
  @ApiProperty({
    description: 'Status update ID',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  id!: string;

  @ApiProperty({
    description: 'Agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  agentId!: string;

  @ApiProperty({
    description: 'Agent type',
    enum: AgentType,
    example: AgentType.DEV,
  })
  agentType!: string;

  @ApiProperty({
    description: 'Agent name',
    example: 'Dev Agent',
  })
  agentName!: string;

  @ApiPropertyOptional({
    description: 'Previous activity status',
    enum: AgentActivityStatus,
    example: AgentActivityStatus.THINKING,
  })
  previousStatus!: string | null;

  @ApiProperty({
    description: 'New activity status',
    enum: AgentActivityStatus,
    example: AgentActivityStatus.CODING,
  })
  newStatus!: string;

  @ApiProperty({
    description: 'Human-readable status message',
    example: 'Started implementing login flow',
  })
  message!: string;

  @ApiProperty({
    description: 'Status update category',
    enum: StatusUpdateCategory,
    example: StatusUpdateCategory.PROGRESS,
  })
  category!: string;

  @ApiPropertyOptional({
    description: 'Additional metadata',
    example: { file: 'src/auth/login.ts' },
  })
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'When the status was updated (ISO string)',
    example: '2026-02-13T14:30:00.000Z',
  })
  createdAt!: string;
}

/**
 * Response for GET /agents/:agentId/status/history
 */
export class GetStatusHistoryResponseDto {
  @ApiProperty({
    description: 'List of status updates',
    type: [StatusUpdateRecordDto],
  })
  statusUpdates!: StatusUpdateRecordDto[];

  @ApiProperty({
    description: 'Whether there are more records',
    example: true,
  })
  hasMore!: boolean;

  @ApiPropertyOptional({
    description: 'Cursor for next page (ISO date string)',
    example: '2026-02-13T14:25:00.000Z',
  })
  cursor?: string;
}

/**
 * Response for GET /workspaces/:workspaceId/status/updates
 */
export class GetWorkspaceStatusUpdatesResponseDto {
  @ApiProperty({
    description: 'List of status updates',
    type: [StatusUpdateRecordDto],
  })
  statusUpdates!: StatusUpdateRecordDto[];

  @ApiProperty({
    description: 'Whether there are more records',
    example: false,
  })
  hasMore!: boolean;
}
