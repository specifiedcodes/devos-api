import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { WorkspaceSettingsService } from '../services/workspace-settings.service';
import { UsageService } from '../../usage/services/usage.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import {
  SetSpendingLimitDto,
  GetSpendingLimitsResponseDto,
} from '../dto/set-spending-limit.dto';

@Controller('api/v1/workspaces/:workspaceId/spending-limits')
@UseGuards(JwtAuthGuard, RoleGuard)
@ApiBearerAuth()
@ApiTags('workspace-settings')
export class WorkspaceSettingsController {
  constructor(
    private readonly workspaceSettingsService: WorkspaceSettingsService,
    private readonly usageService: UsageService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequireRole(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Set spending limits for workspace (Owner only)' })
  @ApiResponse({
    status: 201,
    description: 'Spending limits configured successfully',
    type: GetSpendingLimitsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Owner role required' })
  async setSpendingLimit(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: SetSpendingLimitDto,
    @Request() req: any,
  ): Promise<GetSpendingLimitsResponseDto> {
    // Validate thresholds are between 1-100
    const validThresholds = dto.alert_thresholds.every(
      (t) => t >= 1 && t <= 100,
    );
    if (!validThresholds) {
      throw new BadRequestException(
        'Alert thresholds must be between 1 and 100',
      );
    }

    // Validate thresholds are in ascending order
    const sortedThresholds = [...dto.alert_thresholds].sort((a, b) => a - b);
    if (
      JSON.stringify(sortedThresholds) !== JSON.stringify(dto.alert_thresholds)
    ) {
      throw new BadRequestException(
        'Alert thresholds must be in ascending order',
      );
    }

    // Set spending limits
    await this.workspaceSettingsService.setSpendingLimit(
      workspaceId,
      dto.monthly_limit_usd,
      dto.alert_thresholds,
      dto.limit_enabled,
    );

    // Audit log
    await this.auditService.log(
      workspaceId,
      req.user.id,
      AuditAction.UPDATE,
      'workspace_settings',
      workspaceId,
      {
        action: 'spending_limit_set',
        limit: dto.monthly_limit_usd,
        thresholds: dto.alert_thresholds,
        enabled: dto.limit_enabled,
      },
    );

    // Return updated limits with current usage
    return this.getSpendingLimits(workspaceId);
  }

  @Get()
  @ApiOperation({ summary: 'Get spending limits for workspace' })
  @ApiResponse({
    status: 200,
    description: 'Spending limits retrieved successfully',
    type: GetSpendingLimitsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a workspace member' })
  async getSpendingLimits(
    @Param('workspaceId') workspaceId: string,
  ): Promise<GetSpendingLimitsResponseDto> {
    const settings =
      await this.workspaceSettingsService.getSpendingLimits(workspaceId);

    // Include current month spend for UI
    const currentMonthSpend =
      await this.usageService.getCurrentMonthSpend(workspaceId);

    const percentageUsed =
      settings.monthly_limit_usd && settings.monthly_limit_usd > 0
        ? (currentMonthSpend / settings.monthly_limit_usd) * 100
        : 0;

    return {
      monthly_limit_usd: settings.monthly_limit_usd,
      alert_thresholds: settings.alert_thresholds,
      limit_enabled: settings.limit_enabled,
      triggered_alerts: settings.triggered_alerts,
      current_month_spend: currentMonthSpend,
      percentage_used: Math.round(percentageUsed * 10) / 10, // Round to 1 decimal
    };
  }
}
