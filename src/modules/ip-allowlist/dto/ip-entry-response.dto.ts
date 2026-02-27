import { ApiProperty } from '@nestjs/swagger';
import { IpAllowlistEntry } from '../../../database/entities/ip-allowlist-entry.entity';

export class IpEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() ipAddress!: string;
  @ApiProperty() description!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) createdBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(entity: IpAllowlistEntry): IpEntryResponseDto {
    const dto = new IpEntryResponseDto();
    dto.id = entity.id;
    dto.workspaceId = entity.workspaceId;
    dto.ipAddress = entity.ipAddress;
    dto.description = entity.description;
    dto.isActive = entity.isActive;
    dto.createdBy = entity.createdBy;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class IpConfigResponseDto {
  @ApiProperty() workspaceId!: string;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty({ nullable: true }) gracePeriodEndsAt!: Date | null;
  @ApiProperty({ nullable: true }) emergencyDisableUntil!: Date | null;
  @ApiProperty() isInGracePeriod!: boolean;
  @ApiProperty() isEmergencyDisabled!: boolean;
}

export class IpTestResponseDto {
  @ApiProperty() ipAddress!: string;
  @ApiProperty() isAllowed!: boolean;
  @ApiProperty({ nullable: true }) matchedEntry!: IpEntryResponseDto | null;
  @ApiProperty() isGracePeriod!: boolean;
}

export class BlockedAttemptDto {
  @ApiProperty() ipAddress!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() timestamp!: string;
  @ApiProperty() endpoint!: string;
}
