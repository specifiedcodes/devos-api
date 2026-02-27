import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PermissionAuditEvent,
  PermissionAuditEventType,
} from '../../../database/entities/permission-audit-event.entity';

export class PermissionAuditEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PermissionAuditEventType }) eventType!: string;
  @ApiProperty({ nullable: true }) actorId!: string | null;
  @ApiPropertyOptional() targetUserId!: string | null;
  @ApiPropertyOptional() targetRoleId!: string | null;
  @ApiPropertyOptional() beforeState!: Record<string, any> | null;
  @ApiPropertyOptional() afterState!: Record<string, any> | null;
  @ApiPropertyOptional() ipAddress!: string | null;
  @ApiProperty() createdAt!: string;

  static fromEntity(entity: PermissionAuditEvent): PermissionAuditEventResponseDto {
    const dto = new PermissionAuditEventResponseDto();
    dto.id = entity.id;
    dto.eventType = entity.eventType;
    dto.actorId = entity.actorId;
    dto.targetUserId = entity.targetUserId;
    dto.targetRoleId = entity.targetRoleId;
    dto.beforeState = entity.beforeState;
    dto.afterState = entity.afterState;
    dto.ipAddress = entity.ipAddress;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}

export class PermissionAuditListResponseDto {
  @ApiProperty({ type: [PermissionAuditEventResponseDto] })
  events!: PermissionAuditEventResponseDto[];

  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}

export class PermissionAuditStatsResponseDto {
  @ApiProperty() totalEvents!: number;
  @ApiProperty() eventsByType!: Record<string, number>;
  @ApiProperty() topActors!: Array<{ actorId: string; count: number }>;
  @ApiProperty() accessDenials!: number;
}
