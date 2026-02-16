import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsString,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSessionTimeoutDto {
  @ApiPropertyOptional({ description: 'Absolute session timeout in minutes (5 to 43200)', example: 480 })
  @IsInt()
  @IsOptional()
  @Min(5)
  @Max(43200)
  @Type(() => Number)
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({ description: 'Idle timeout in minutes (5 to 1440)', example: 30 })
  @IsInt()
  @IsOptional()
  @Min(5)
  @Max(1440)
  @Type(() => Number)
  idleTimeoutMinutes?: number;
}

export class ForceReauthDto {
  @ApiPropertyOptional({ description: 'Specific user ID to force re-authenticate. If omitted, all workspace users are forced.' })
  @IsUUID()
  @IsOptional()
  targetUserId?: string;

  @ApiProperty({ description: 'Reason for forcing re-authentication', example: 'security_incident' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class FederatedSessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() providerType!: string;
  @ApiProperty() providerConfigId!: string;
  @ApiPropertyOptional() idpSessionId!: string | null;
  @ApiProperty() devosSessionId!: string;
  @ApiProperty() sessionTimeoutMinutes!: number;
  @ApiProperty() idleTimeoutMinutes!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() lastActivityAt!: Date;
  @ApiPropertyOptional() terminatedAt!: Date | null;
  @ApiPropertyOptional() terminationReason!: string | null;
  @ApiProperty({ description: 'Whether the session is currently active' })
  isActive!: boolean;
  @ApiProperty({ description: 'Minutes remaining before absolute expiry' })
  remainingMinutes!: number;
}

export class SessionListQueryDto {
  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter: active, terminated, or all', enum: ['active', 'terminated', 'all'] })
  @IsString()
  @IsOptional()
  @IsEnum(['active', 'terminated', 'all'])
  status?: 'active' | 'terminated' | 'all';

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;
}

export class WorkspaceSessionSummaryResponseDto {
  @ApiProperty() workspaceId!: string;
  @ApiProperty() totalActiveSessions!: number;
  @ApiProperty() activeUsers!: number;
  @ApiProperty() sessionsByProvider!: Record<string, number>;
}

export class ForceReauthResponseDto {
  @ApiProperty() terminatedCount!: number;
  @ApiProperty() affectedUserIds!: string[];
}

export class SessionExpiryWarningDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty() remainingMinutes!: number;
  @ApiProperty() reason!: 'absolute_timeout' | 'idle_timeout';
}

export class ValidateSessionDto {
  @ApiProperty({ description: 'The session ID to validate' })
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
