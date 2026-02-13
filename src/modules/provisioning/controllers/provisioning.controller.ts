import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ServiceAuthGuard } from '../../../shared/guards/service-auth.guard';
import { ProjectWorkspaceAccessGuard } from '../../../shared/guards/project-workspace-access.guard';
import { ProvisioningStatusService } from '../services/provisioning-status.service';
import { ProvisioningOrchestratorService } from '../services/provisioning-orchestrator.service';
import { ProvisioningStatusResponseDto } from '../dto/provisioning-status-response.dto';
import { CreateProvisioningStatusDto } from '../dto/create-provisioning-status.dto';
import { UpdateStepStatusDto } from '../dto/update-step-status.dto';

/**
 * ProvisioningController
 *
 * REST API endpoints for provisioning status tracking
 * - GET /api/v1/provisioning/status/:projectId (user-facing, requires JWT)
 * - POST /api/v1/provisioning/status (internal, requires service API key)
 * - PATCH /api/v1/provisioning/status/:projectId/step (internal, requires service API key)
 *
 * Part of Epic 4 Story 4.7: Auto-Provisioning Status Backend
 */
@ApiTags('Provisioning')
@Controller('api/v1/provisioning')
export class ProvisioningController {
  private readonly logger = new Logger(ProvisioningController.name);

  constructor(
    private readonly provisioningStatusService: ProvisioningStatusService,
    private readonly provisioningOrchestrator: ProvisioningOrchestratorService,
  ) {}

  /**
   * GET /api/v1/provisioning/status/:projectId
   * Get current provisioning status for a project (user-facing)
   */
  @Get('status/:projectId')
  @UseGuards(JwtAuthGuard, ProjectWorkspaceAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get provisioning status for a project' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Provisioning status retrieved successfully',
    type: ProvisioningStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found or no provisioning status exists' })
  @ApiResponse({ status: 403, description: 'User lacks permission to access this project' })
  async getProvisioningStatus(
    @Param('projectId') projectId: string,
  ): Promise<ProvisioningStatusResponseDto> {
    this.logger.log(`Getting provisioning status for project ${projectId}`);

    const provisioningStatus = await this.provisioningStatusService.findByProjectId(projectId);

    if (!provisioningStatus) {
      throw new NotFoundException(`Provisioning status not found for project ${projectId}`);
    }

    return provisioningStatus as ProvisioningStatusResponseDto;
  }

  /**
   * POST /api/v1/provisioning/status
   * Create a new provisioning status record (internal API)
   */
  @Post('status')
  @UseGuards(ServiceAuthGuard)
  @ApiOperation({ summary: 'Create provisioning status (internal API)' })
  @ApiResponse({
    status: 201,
    description: 'Provisioning status created successfully',
    type: ProvisioningStatusResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Provisioning status already exists for this project' })
  @ApiResponse({ status: 401, description: 'Invalid or missing service API key' })
  async createProvisioningStatus(
    @Body() createDto: CreateProvisioningStatusDto,
  ): Promise<ProvisioningStatusResponseDto> {
    this.logger.log(`Creating provisioning status for project ${createDto.projectId}`);

    // Check if provisioning status already exists
    const existing = await this.provisioningStatusService.findByProjectId(createDto.projectId);
    if (existing) {
      throw new ConflictException(
        `Provisioning status already exists for project ${createDto.projectId}`,
      );
    }

    const provisioningStatus = await this.provisioningStatusService.createProvisioningStatus(
      createDto.projectId,
      createDto.workspaceId,
    );

    return provisioningStatus as ProvisioningStatusResponseDto;
  }

  /**
   * PATCH /api/v1/provisioning/status/:projectId/step
   * Update a specific provisioning step status (internal API)
   */
  @Patch('status/:projectId/step')
  @UseGuards(ServiceAuthGuard)
  @ApiOperation({ summary: 'Update provisioning step status (internal API)' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Step status updated successfully',
    type: ProvisioningStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found or no provisioning status exists' })
  @ApiResponse({ status: 400, description: 'Invalid step name or status value' })
  @ApiResponse({ status: 401, description: 'Invalid or missing service API key' })
  async updateStepStatus(
    @Param('projectId') projectId: string,
    @Body() updateDto: UpdateStepStatusDto,
  ): Promise<ProvisioningStatusResponseDto> {
    this.logger.log(`Updating step ${updateDto.stepName} to ${updateDto.status} for project ${projectId}`);

    // Validate step name
    const validStepNames = [
      'github_repo_created',
      'database_provisioned',
      'deployment_configured',
      'project_initialized',
    ];

    if (!validStepNames.includes(updateDto.stepName)) {
      throw new BadRequestException(
        `Invalid step name: ${updateDto.stepName}. Valid steps: ${validStepNames.join(', ')}`,
      );
    }

    const updatedStatus = await this.provisioningStatusService.updateStepStatus(
      projectId,
      updateDto.stepName as any,
      updateDto.status,
      updateDto.error,
    );

    // Auto-update overall status if all steps complete or any fails
    const allStepsCompleted = Object.values(updatedStatus.steps).every(
      (step) => step.status === 'completed',
    );
    const anyStepFailed = Object.values(updatedStatus.steps).some(
      (step) => step.status === 'failed',
    );

    if (allStepsCompleted) {
      await this.provisioningStatusService.updateOverallStatus(projectId, 'completed' as any);
    } else if (anyStepFailed) {
      await this.provisioningStatusService.updateOverallStatus(
        projectId,
        'failed' as any,
        updateDto.error,
      );
    }

    return updatedStatus as ProvisioningStatusResponseDto;
  }

  /**
   * PATCH /api/v1/provisioning/status/:projectId/retry
   * Retry failed provisioning workflow (user-facing)
   * Story 4.7 Issue #8 Fix: Implemented retry endpoint
   */
  @Patch('status/:projectId/retry')
  @UseGuards(JwtAuthGuard, ProjectWorkspaceAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry failed provisioning workflow' })
  @ApiParam({ name: 'projectId', description: 'Project ID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Provisioning retry initiated successfully',
    type: ProvisioningStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Project not found or no provisioning status exists' })
  @ApiResponse({ status: 400, description: 'Provisioning status is not failed (cannot retry)' })
  @ApiResponse({ status: 403, description: 'User lacks permission to access this project' })
  async retryProvisioning(
    @Param('projectId') projectId: string,
  ): Promise<ProvisioningStatusResponseDto> {
    this.logger.log(`Retrying provisioning for project ${projectId}`);

    const provisioningStatus = await this.provisioningStatusService.findByProjectId(projectId);

    if (!provisioningStatus) {
      throw new NotFoundException(`Provisioning status not found for project ${projectId}`);
    }

    // Validate status is 'failed' (can only retry failed provisioning)
    if (provisioningStatus.status !== 'failed') {
      throw new BadRequestException(
        `Cannot retry provisioning: current status is '${provisioningStatus.status}' (must be 'failed')`,
      );
    }

    // Find the first failed step
    const failedStep = Object.entries(provisioningStatus.steps).find(
      ([_, step]) => step.status === 'failed',
    );

    if (!failedStep) {
      throw new BadRequestException('No failed step found to retry');
    }

    const [stepName] = failedStep;

    // Retry the failed step (runs asynchronously)
    this.provisioningOrchestrator
      .retryFailedStep(projectId, stepName)
      .then(() => {
        this.logger.log(`Retry succeeded for step ${stepName} in project ${projectId}`);
      })
      .catch((error) => {
        this.logger.error(
          `Retry failed for step ${stepName} in project ${projectId}: ${error.message}`,
          error.stack,
        );
      });

    // Return current status (retry is async)
    return provisioningStatus as ProvisioningStatusResponseDto;
  }
}
