/**
 * User Kanban Preferences Controller
 * Story 7.8: Kanban Board Customization
 *
 * Endpoints for managing user Kanban board preferences.
 */

import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UserKanbanPreferencesService } from '../services/user-kanban-preferences.service';
import {
  KanbanPreferencesResponseDto,
  UpdateKanbanPreferencesDto,
} from '../dto/kanban-preferences.dto';
import { User } from '../../../database/entities/user.entity';

@ApiTags('Kanban Preferences')
@Controller('api/v1/users/me/preferences/kanban')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserKanbanPreferencesController {
  private readonly logger = new Logger(UserKanbanPreferencesController.name);

  constructor(
    private readonly preferencesService: UserKanbanPreferencesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get Kanban board preferences' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Optional project ID for per-project preferences' })
  @ApiResponse({
    status: 200,
    description: 'Kanban preferences retrieved successfully',
    type: KanbanPreferencesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPreferences(
    @Req() req: Request & { user: User },
    @Query('projectId') projectId?: string,
  ): Promise<{ preferences: KanbanPreferencesResponseDto }> {
    const userId = req.user.id;
    this.logger.debug(`Getting preferences for user ${userId}, project ${projectId || 'default'}`);

    const preferences = await this.preferencesService.getPreferences(userId, projectId);

    return { preferences: preferences as KanbanPreferencesResponseDto };
  }

  @Put()
  @ApiOperation({ summary: 'Update Kanban board preferences' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Optional project ID for per-project preferences' })
  @ApiResponse({
    status: 200,
    description: 'Kanban preferences updated successfully',
    type: KanbanPreferencesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updatePreferences(
    @Req() req: Request & { user: User },
    @Body() body: UpdateKanbanPreferencesDto,
    @Query('projectId') projectId?: string,
  ): Promise<{ preferences: KanbanPreferencesResponseDto }> {
    const userId = req.user.id;
    this.logger.debug(`Updating preferences for user ${userId}, project ${projectId || 'default'}`);

    const preferences = await this.preferencesService.updatePreferences(
      userId,
      projectId || null,
      {
        columns: body.columns,
        cardDisplay: body.cardDisplay,
        theme: body.theme,
      },
    );

    return { preferences: preferences as KanbanPreferencesResponseDto };
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset Kanban board preferences to defaults' })
  @ApiQuery({ name: 'projectId', required: false, description: 'Optional project ID for per-project preferences' })
  @ApiResponse({
    status: 200,
    description: 'Kanban preferences reset to defaults',
    type: KanbanPreferencesResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resetPreferences(
    @Req() req: Request & { user: User },
    @Query('projectId') projectId?: string,
  ): Promise<{ preferences: KanbanPreferencesResponseDto }> {
    const userId = req.user.id;
    this.logger.debug(`Resetting preferences for user ${userId}, project ${projectId || 'default'}`);

    const preferences = await this.preferencesService.resetPreferences(userId, projectId);

    return { preferences: preferences as KanbanPreferencesResponseDto };
  }
}
