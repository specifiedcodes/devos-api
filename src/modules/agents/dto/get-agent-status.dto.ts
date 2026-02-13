import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for getting agent status - URL parameters
 * Story 9.3: Agent Status Updates
 */
export class GetAgentStatusParamsDto {
  @ApiProperty({
    description: 'Workspace ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({
    description: 'Agent ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  agentId!: string;
}
