import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '../../../database/entities/project.entity';

export class ProjectResponseDto {
  @ApiProperty({
    description: 'Project ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Project name',
    example: 'My Awesome Project',
  })
  name!: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'A description of my awesome project',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Template ID',
    example: 'nextjs-typescript-template',
  })
  templateId?: string;

  @ApiPropertyOptional({
    description: 'GitHub repository URL',
    example: 'https://github.com/user/repo',
  })
  githubRepoUrl?: string;

  @ApiPropertyOptional({
    description: 'Deployment URL',
    example: 'https://myproject.vercel.app',
  })
  deploymentUrl?: string;

  @ApiProperty({
    description: 'Workspace ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  workspaceId!: string;

  @ApiProperty({
    description: 'User ID who created the project',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  createdByUserId!: string;

  @ApiProperty({
    description: 'Project status',
    example: 'active',
    enum: ProjectStatus,
  })
  status!: ProjectStatus;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-01-30T00:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-01-30T00:00:00.000Z',
  })
  updatedAt!: Date;

  @ApiPropertyOptional({
    description: 'Creator user information',
    example: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      name: 'John Doe',
      email: 'user@example.com',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  })
  createdBy?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };

  @ApiProperty({
    description: 'Number of active agents working on this project',
    example: 2,
    default: 0,
  })
  activeAgentCount!: number;
}
