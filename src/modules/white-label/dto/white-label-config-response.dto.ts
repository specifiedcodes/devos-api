/**
 * White-Label Config Response DTO
 * Story 22-1: White-Label Configuration (AC2)
 *
 * Response DTO for white-label configuration.
 * Excludes sensitive fields like domain_verification_token.
 */

import {
  WhiteLabelConfig,
  BackgroundMode,
  DomainStatus,
} from '../../../database/entities/white-label-config.entity';

export class WhiteLabelConfigResponseDto {
  id!: string;
  workspaceId!: string;
  appName!: string;
  logoUrl!: string | null;
  logoDarkUrl!: string | null;
  faviconUrl!: string | null;
  primaryColor!: string;
  secondaryColor!: string;
  backgroundMode!: BackgroundMode;
  fontFamily!: string;
  customCss!: string | null;
  customDomain!: string | null;
  domainStatus!: DomainStatus | null;
  domainVerifiedAt!: Date | null;
  sslProvisioned!: boolean;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  static fromEntity(entity: WhiteLabelConfig): WhiteLabelConfigResponseDto {
    const dto = new WhiteLabelConfigResponseDto();
    dto.id = entity.id;
    dto.workspaceId = entity.workspaceId;
    dto.appName = entity.appName;
    dto.logoUrl = entity.logoUrl ?? null;
    dto.logoDarkUrl = entity.logoDarkUrl ?? null;
    dto.faviconUrl = entity.faviconUrl ?? null;
    dto.primaryColor = entity.primaryColor;
    dto.secondaryColor = entity.secondaryColor;
    dto.backgroundMode = entity.backgroundMode;
    dto.fontFamily = entity.fontFamily;
    dto.customCss = entity.customCss ?? null;
    dto.customDomain = entity.customDomain ?? null;
    dto.domainStatus = entity.domainStatus ?? null;
    dto.domainVerifiedAt = entity.domainVerifiedAt ?? null;
    dto.sslProvisioned = entity.sslProvisioned;
    dto.isActive = entity.isActive;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
