import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendCapService } from '../services/spend-cap.service';
import { SpendCapEnforcementService } from '../services/spend-cap-enforcement.service';
import { SpendCapConfigDto } from '../dto/spend-cap-config.dto';
import { SpendCapOverrideDto } from '../dto/spend-cap-override.dto';
import { WorkspaceSettings } from '../../../database/entities/workspace-settings.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';

/**
 * SpendCapController - REST API for spend cap management
 *
 * Story 13-7: Spend Caps & Auto-Downgrade
 *
 * Provides endpoints for:
 * - GET /status - Current spend cap status
 * - PUT /config - Update spend cap configuration
 * - PUT /override - Toggle override settings
 * - GET /evaluate - Get enforcement decision for a task type
 */
@Controller('api/v1/workspaces/:workspaceId/spend-cap')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard)
export class SpendCapController {
  constructor(
    private readonly spendCapService: SpendCapService,
    private readonly enforcementService: SpendCapEnforcementService,
    @InjectRepository(WorkspaceSettings)
    private readonly workspaceSettingsRepo: Repository<WorkspaceSettings>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * GET /api/v1/workspaces/:workspaceId/spend-cap/status
   *
   * Returns current spend cap status with spend level, budget info, enforcement status.
   */
  @Get('status')
  async getStatus(@Param('workspaceId') workspaceId: string) {
    return this.spendCapService.getSpendCapStatus(workspaceId);
  }

  /**
   * PUT /api/v1/workspaces/:workspaceId/spend-cap/config
   *
   * Updates spend cap configuration (thresholds, downgrade rules, enable/disable).
   * Validates threshold ordering: warning < downgrade < critical < hard_cap.
   */
  @Put('config')
  async updateConfig(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SpendCapConfigDto,
    @Req() req: Request,
  ) {
    const settings = await this.workspaceSettingsRepo.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      throw new BadRequestException('Workspace settings not found');
    }

    // Validate threshold ordering with existing values for partial updates
    const finalWarning = dto.warningThreshold ?? settings.warningThreshold;
    const finalDowngrade = dto.downgradeThreshold ?? settings.downgradeThreshold;
    const finalCritical = dto.criticalThreshold ?? settings.criticalThreshold;
    const finalHardCap = dto.hardCapThreshold ?? settings.hardCapThreshold;

    if (
      finalWarning >= finalDowngrade ||
      finalDowngrade >= finalCritical ||
      finalCritical >= finalHardCap
    ) {
      throw new BadRequestException(
        'Thresholds must be in ascending order: warningThreshold < downgradeThreshold < criticalThreshold < hardCapThreshold',
      );
    }

    // Validate monthlyBudget > 0 when enabling spend cap
    const willBeEnabled = dto.spendCapEnabled ?? settings.spendCapEnabled;
    const budget = dto.monthlyBudget ?? settings.monthlyLimitUsd;
    if (willBeEnabled && (!budget || budget <= 0)) {
      throw new BadRequestException(
        'monthlyBudget must be greater than 0 when spendCapEnabled is true',
      );
    }

    // Build update object
    const update: Partial<WorkspaceSettings> = {};
    if (dto.spendCapEnabled !== undefined) update.spendCapEnabled = dto.spendCapEnabled;
    if (dto.monthlyBudget !== undefined) update.monthlyLimitUsd = dto.monthlyBudget;
    if (dto.warningThreshold !== undefined) update.warningThreshold = dto.warningThreshold;
    if (dto.downgradeThreshold !== undefined) update.downgradeThreshold = dto.downgradeThreshold;
    if (dto.criticalThreshold !== undefined) update.criticalThreshold = dto.criticalThreshold;
    if (dto.hardCapThreshold !== undefined) update.hardCapThreshold = dto.hardCapThreshold;
    if (dto.downgradeRules !== undefined) update.downgradeRules = dto.downgradeRules;

    await this.workspaceSettingsRepo.update({ workspaceId }, update);

    // Invalidate cache
    await this.spendCapService.invalidateCache(workspaceId);

    // Audit log
    const userId = (req as any).user?.id || 'system';
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.WORKSPACE_SETTINGS_UPDATED,
      'workspace_settings',
      settings.id,
      { action: 'spend_cap_config_updated', ...dto },
    );

    // Return updated status
    return this.spendCapService.getSpendCapStatus(workspaceId);
  }

  /**
   * PUT /api/v1/workspaces/:workspaceId/spend-cap/override
   *
   * Toggles override settings (force premium, pause auto-downgrade, increase budget).
   */
  @Put('override')
  async updateOverride(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SpendCapOverrideDto,
    @Req() req: Request,
  ) {
    const settings = await this.workspaceSettingsRepo.findOne({
      where: { workspaceId },
    });

    if (!settings) {
      throw new BadRequestException('Workspace settings not found');
    }

    const update: Partial<WorkspaceSettings> = {};
    if (dto.forcePremiumOverride !== undefined) update.forcePremiumOverride = dto.forcePremiumOverride;
    if (dto.autoDowngradePaused !== undefined) update.autoDowngradePaused = dto.autoDowngradePaused;
    if (dto.increaseBudgetTo !== undefined) {
      if (dto.increaseBudgetTo <= (settings.monthlyLimitUsd || 0)) {
        throw new BadRequestException(
          'increaseBudgetTo must be greater than current monthly budget',
        );
      }
      update.monthlyLimitUsd = dto.increaseBudgetTo;
    }

    await this.workspaceSettingsRepo.update({ workspaceId }, update);

    // Invalidate cache
    await this.spendCapService.invalidateCache(workspaceId);

    // Audit log
    const userId = (req as any).user?.id || 'system';
    await this.auditService.log(
      workspaceId,
      userId,
      AuditAction.WORKSPACE_SETTINGS_UPDATED,
      'workspace_settings',
      settings.id,
      { action: 'spend_cap_override_updated', ...dto },
    );

    // Return updated status
    return this.spendCapService.getSpendCapStatus(workspaceId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/spend-cap/evaluate?taskType=coding
   *
   * Returns enforcement decision for a specific task type.
   * Used by orchestrator before routing.
   */
  @Get('evaluate')
  async evaluate(
    @Param('workspaceId') workspaceId: string,
    @Query('taskType') taskType: string,
  ) {
    if (!taskType) {
      throw new BadRequestException('taskType query parameter is required');
    }
    return this.enforcementService.evaluate(workspaceId, taskType);
  }
}
