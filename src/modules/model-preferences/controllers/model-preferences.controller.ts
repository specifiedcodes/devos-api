/**
 * ModelPreferencesController
 *
 * Story 13-9: User Model Preferences
 *
 * REST API endpoints for managing workspace model preferences.
 * All endpoints are protected by JWT authentication and workspace access guards.
 */
import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { ModelPreferencesService } from '../services/model-preferences.service';
import { UpdateModelPreferencesDto, ValidateModelDto } from '../dto/update-model-preferences.dto';

@Controller('api/v1/workspaces/:workspaceId/model-preferences')
@UseGuards(JwtAuthGuard, RoleGuard)
export class ModelPreferencesController {
  constructor(
    private readonly modelPreferencesService: ModelPreferencesService,
  ) {}

  /**
   * GET /api/v1/workspaces/:workspaceId/model-preferences
   * Returns full model preferences with available models, providers, and cost estimates.
   */
  @Get()
  async getPreferences(@Param('workspaceId') workspaceId: string) {
    return this.modelPreferencesService.getPreferences(workspaceId);
  }

  /**
   * PUT /api/v1/workspaces/:workspaceId/model-preferences
   * Updates model preferences. Requires workspace owner or admin role.
   */
  @Put()
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  async updatePreferences(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateModelPreferencesDto,
    @Request() req: any,
  ) {
    const userId = req.user?.id || req.user?.sub;
    return this.modelPreferencesService.updatePreferences(workspaceId, dto, userId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/model-preferences/router
   * Returns lightweight RouterPreferences for the orchestrator.
   * Returns 204 No Content if preferences are disabled.
   */
  @Get('router')
  async getRouterPreferences(
    @Param('workspaceId') workspaceId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const prefs = await this.modelPreferencesService.getRouterPreferences(workspaceId);
    if (prefs === null) {
      res.status(HttpStatus.NO_CONTENT);
      return;
    }
    return prefs;
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/model-preferences/available-models
   * Returns all available models with hasApiKey status.
   */
  @Get('available-models')
  async getAvailableModels(@Param('workspaceId') workspaceId: string) {
    return this.modelPreferencesService.getAvailableModels(workspaceId);
  }

  /**
   * GET /api/v1/workspaces/:workspaceId/model-preferences/estimate
   * Returns estimated monthly costs for each preset.
   */
  @Get('estimate')
  async getEstimate(
    @Param('workspaceId') workspaceId: string,
    @Query('preset') preset?: string,
  ) {
    return this.modelPreferencesService.getEstimatedCost(workspaceId, preset);
  }

  /**
   * POST /api/v1/workspaces/:workspaceId/model-preferences/validate-model
   * Validates a model selection for the workspace.
   */
  @Post('validate-model')
  @HttpCode(HttpStatus.OK)
  async validateModel(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ValidateModelDto,
  ) {
    return this.modelPreferencesService.validateModelSelection(
      body.modelId,
      workspaceId,
    );
  }
}
