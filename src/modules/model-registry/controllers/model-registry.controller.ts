/**
 * ModelRegistryController
 *
 * Story 13-2: Model Registry
 *
 * REST API endpoints for the model registry.
 * Read endpoints require authentication; write endpoints require admin role.
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { ModelRegistryService } from '../services/model-registry.service';
import { CreateModelDefinitionDto } from '../dto/create-model-definition.dto';
import { UpdateModelDefinitionDto } from '../dto/update-model-definition.dto';
import { ModelRegistryFiltersDto } from '../dto/model-registry-filters.dto';
import { VALID_TASK_TYPES, TaskType } from '../../../database/entities/model-definition.entity';

@Controller('api/model-registry')
@UseGuards(JwtAuthGuard)
export class ModelRegistryController {
  constructor(private readonly modelRegistryService: ModelRegistryService) {}

  /**
   * GET /api/model-registry/models
   * List all models with optional filters
   */
  @Get('models')
  async listModels(@Query() filters: ModelRegistryFiltersDto) {
    return this.modelRegistryService.findAll({
      provider: filters.provider,
      qualityTier: filters.qualityTier,
      taskType: filters.taskType,
      available: filters.available,
      supportsTools: filters.supportsTools,
      supportsVision: filters.supportsVision,
      supportsEmbedding: filters.supportsEmbedding,
    });
  }

  /**
   * GET /api/model-registry/models/task/:taskType
   * Get models suitable for a task type
   * NOTE: Must be defined BEFORE /models/:modelId to avoid route collision
   */
  @Get('models/task/:taskType')
  async getModelsForTask(@Param('taskType') taskType: string) {
    if (!VALID_TASK_TYPES.includes(taskType as TaskType)) {
      throw new BadRequestException(
        `Invalid task type '${taskType}'. Valid types: ${VALID_TASK_TYPES.join(', ')}`,
      );
    }
    return this.modelRegistryService.findSuitableForTask(taskType as TaskType);
  }

  /**
   * GET /api/model-registry/models/provider/:provider
   * Get models by provider
   * NOTE: Must be defined BEFORE /models/:modelId to avoid route collision
   */
  @Get('models/provider/:provider')
  async getModelsByProvider(@Param('provider') provider: string) {
    return this.modelRegistryService.findByProvider(provider);
  }

  /**
   * GET /api/model-registry/models/:modelId
   * Get a single model by model ID
   */
  @Get('models/:modelId')
  async getModel(@Param('modelId') modelId: string) {
    const model = await this.modelRegistryService.findByModelId(modelId);
    if (!model) {
      throw new NotFoundException(`Model with modelId '${modelId}' not found`);
    }
    return model;
  }

  /**
   * POST /api/model-registry/models
   * Create a new model definition (admin only)
   */
  @Post('models')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createModel(@Body() dto: CreateModelDefinitionDto) {
    return this.modelRegistryService.create(dto);
  }

  /**
   * PATCH /api/model-registry/models/:modelId
   * Update a model definition (admin only)
   */
  @Patch('models/:modelId')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  async updateModel(
    @Param('modelId') modelId: string,
    @Body() dto: UpdateModelDefinitionDto,
  ) {
    return this.modelRegistryService.update(modelId, dto);
  }

  /**
   * POST /api/model-registry/models/:modelId/deprecate
   * Mark a model as deprecated (admin only)
   */
  @Post('models/:modelId/deprecate')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  async deprecateModel(
    @Param('modelId') modelId: string,
    @Body() body: { deprecationDate: string },
  ) {
    if (!body.deprecationDate) {
      throw new BadRequestException('deprecationDate is required');
    }
    const date = new Date(body.deprecationDate);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid deprecationDate format');
    }
    return this.modelRegistryService.deprecate(modelId, date);
  }

  /**
   * PATCH /api/model-registry/models/:modelId/availability
   * Toggle model availability (admin only)
   */
  @Patch('models/:modelId/availability')
  @UseGuards(RoleGuard)
  @RequireRole(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  async setAvailability(
    @Param('modelId') modelId: string,
    @Body() body: { available: boolean },
  ) {
    if (body.available === undefined || body.available === null) {
      throw new BadRequestException('available field is required');
    }
    return this.modelRegistryService.setAvailability(modelId, body.available);
  }
}
