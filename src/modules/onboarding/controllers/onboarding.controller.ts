import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OnboardingService } from '../services/onboarding.service';
import { OnboardingStatusResponseDto } from '../dto/onboarding-status-response.dto';
import {
  UpdateOnboardingStepDto,
  VALID_STEP_NAMES,
  ValidStepName,
} from '../dto/update-onboarding-step.dto';
import { OnboardingStatus } from '../../../database/entities/onboarding-status.entity';

@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('api/v1/onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * GET /api/v1/onboarding/status
   * Get current user's onboarding status
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get onboarding status',
    description: 'Retrieve the current user\'s onboarding progress with completion percentage and next step guidance',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding status retrieved successfully',
    type: OnboardingStatusResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Onboarding status not found for user',
  })
  async getStatus(
    @Request() req: any,
  ): Promise<OnboardingStatusResponseDto> {
    const userId = req.user.userId;
    // Note: Using current workspace from JWT. Onboarding is workspace-scoped.
    // For multi-workspace scenarios, onboarding status is tied to the workspace
    // where the user first registered (default workspace created during signup).
    const workspaceId = req.user.workspaceId;

    this.logger.log(
      `Getting onboarding status for user ${userId} in workspace ${workspaceId}`,
    );

    return this.onboardingService.getOnboardingStatus(userId, workspaceId);
  }

  /**
   * PATCH /api/v1/onboarding/steps/:stepName
   * Update a specific onboarding step
   */
  @Patch('steps/:stepName')
  @ApiOperation({
    summary: 'Update onboarding step',
    description: `Mark a specific onboarding step as complete or incomplete. Valid steps: ${VALID_STEP_NAMES.join(', ')}`,
  })
  @ApiParam({
    name: 'stepName',
    description: 'Name of the onboarding step to update',
    enum: VALID_STEP_NAMES,
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding step updated successfully',
    type: OnboardingStatus,
  })
  @ApiBadRequestResponse({
    description: 'Invalid step name provided',
  })
  @ApiNotFoundResponse({
    description: 'Onboarding status not found for user',
  })
  async updateStep(
    @Request() req: any,
    @Param('stepName') stepName: string,
    @Body() updateDto: UpdateOnboardingStepDto,
  ): Promise<OnboardingStatus> {
    const userId = req.user.userId;
    const workspaceId = req.user.workspaceId;

    // Validate step name (validation done here instead of DTO because stepName is in URL path)
    if (!VALID_STEP_NAMES.includes(stepName as ValidStepName)) {
      throw new BadRequestException(
        `Invalid step name. Valid steps: ${VALID_STEP_NAMES.join(', ')}`,
      );
    }

    this.logger.log(
      `Updating onboarding step ${stepName}=${updateDto.value} for user ${userId}`,
    );

    return this.onboardingService.updateStep(
      userId,
      workspaceId,
      stepName as ValidStepName,
      updateDto.value,
    );
  }

  /**
   * POST /api/v1/onboarding/skip
   * Mark onboarding as skipped/completed
   */
  @Post('skip')
  @ApiOperation({
    summary: 'Skip onboarding',
    description: 'Mark onboarding as completed by setting all required steps to true. Used when user wants to skip the guided onboarding flow.',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding marked as skipped/completed successfully',
    type: OnboardingStatusResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Onboarding status not found for user',
  })
  async skipOnboarding(@Request() req: any): Promise<OnboardingStatusResponseDto> {
    const userId = req.user.userId;
    const workspaceId = req.user.workspaceId;

    this.logger.log(
      `Skipping onboarding for user ${userId} in workspace ${workspaceId}`,
    );

    // Mark all required steps as complete to trigger completion
    await this.onboardingService.updateStep(
      userId,
      workspaceId,
      'aiKeyAdded',
      true,
    );
    await this.onboardingService.updateStep(
      userId,
      workspaceId,
      'firstProjectCreated',
      true,
    );

    // Return consistent DTO format (Issue #5)
    return this.onboardingService.getOnboardingStatus(userId, workspaceId);
  }
}
