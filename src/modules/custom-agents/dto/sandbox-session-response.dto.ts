/**
 * Sandbox Session Response DTOs
 *
 * Story 18-3: Agent Sandbox Testing
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SandboxSampleProject, SandboxSessionStatus } from '../../../database/entities/agent-sandbox-session.entity';
import { SandboxToolCallStatus } from '../../../database/entities/agent-sandbox-tool-call.entity';

export class SandboxSessionResponseDto {
  @ApiProperty({ description: 'Session ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Workspace ID', format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ description: 'Agent definition ID', format: 'uuid' })
  agentDefinitionId!: string;

  @ApiProperty({ description: 'User ID who created the session', format: 'uuid' })
  userId!: string;

  @ApiPropertyOptional({ description: 'Test scenario ID if used', format: 'uuid' })
  testScenarioId?: string | null;

  @ApiProperty({ description: 'Sample project type', enum: SandboxSampleProject })
  sampleProject!: SandboxSampleProject;

  @ApiProperty({ description: 'Session timeout in minutes' })
  timeoutMinutes!: number;

  @ApiProperty({ description: 'Maximum tool calls allowed' })
  maxToolCalls!: number;

  @ApiProperty({ description: 'Maximum tokens allowed' })
  maxTokens!: number;

  @ApiProperty({ description: 'Session status', enum: SandboxSessionStatus })
  status!: SandboxSessionStatus;

  @ApiPropertyOptional({ description: 'When session started', format: 'date-time' })
  startedAt?: Date | null;

  @ApiPropertyOptional({ description: 'When session completed', format: 'date-time' })
  completedAt?: Date | null;

  @ApiProperty({ description: 'When session expires', format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ description: 'Input tokens used' })
  tokensInput!: number;

  @ApiProperty({ description: 'Output tokens used' })
  tokensOutput!: number;

  @ApiProperty({ description: 'Tool calls made' })
  toolCallsCount!: number;

  @ApiProperty({ description: 'Estimated cost in cents' })
  estimatedCostCents!: number;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string | null;

  @ApiPropertyOptional({ description: 'Test inputs' })
  testInputs?: Record<string, unknown> | null;

  @ApiProperty({ description: 'When session was created', format: 'date-time' })
  createdAt!: Date;
}

export class SandboxSessionStatusDto extends SandboxSessionResponseDto {
  @ApiPropertyOptional({ description: 'Test outputs from the session' })
  testOutputs?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: 'Sandbox configuration' })
  sandboxConfig?: Record<string, unknown>;
}

export class SandboxToolCallDto {
  @ApiProperty({ description: 'Tool call ID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Tool category' })
  toolCategory!: string;

  @ApiProperty({ description: 'Tool name' })
  toolName!: string;

  @ApiProperty({ description: 'Tool input parameters' })
  toolInput!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Tool output result' })
  toolOutput?: Record<string, unknown> | null;

  @ApiProperty({ description: 'Tool call status', enum: SandboxToolCallStatus })
  status!: SandboxToolCallStatus;

  @ApiPropertyOptional({ description: 'Reason if denied' })
  denialReason?: string | null;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  errorMessage?: string | null;

  @ApiProperty({ description: 'Duration in milliseconds' })
  durationMs!: number;

  @ApiProperty({ description: 'When tool call was created', format: 'date-time' })
  createdAt!: Date;
}

export class SandboxSessionResultsDto {
  @ApiProperty({ description: 'Session details', type: SandboxSessionStatusDto })
  session!: SandboxSessionStatusDto;

  @ApiProperty({ description: 'List of tool calls made', type: [SandboxToolCallDto] })
  toolCalls!: SandboxToolCallDto[];

  @ApiPropertyOptional({ description: 'Test outputs from the session' })
  testOutputs?: Record<string, unknown> | null;

  @ApiProperty({
    description: 'Summary of session results',
    example: {
      durationMs: 45000,
      successRate: 0.85,
      deniedCount: 2,
      errorCount: 1,
    },
  })
  summary!: {
    durationMs: number;
    successRate: number;
    deniedCount: number;
    errorCount: number;
  };
}
