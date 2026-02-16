import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JitProvisioningService } from './jit-provisioning.service';
import { JitProvisioningConfig } from '../../../database/entities/jit-provisioning-config.entity';
import {
  UpdateJitProvisioningConfigDto,
  JitProvisioningConfigResponseDto,
  ExtractedIdpAttributes,
} from '../dto/jit-provisioning.dto';

@ApiTags('SSO - JIT Provisioning')
@Controller('api/auth/sso/jit-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class JitProvisioningController {
  constructor(
    private readonly jitProvisioningService: JitProvisioningService,
  ) {}

  /**
   * GET /api/auth/sso/jit-config?workspaceId=...
   * Get the JIT provisioning configuration for a workspace.
   * Creates default config if none exists.
   */
  @Get()
  @ApiOperation({ summary: 'Get JIT provisioning configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiResponse({ status: 200, type: JitProvisioningConfigResponseDto })
  async getConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<JitProvisioningConfigResponseDto> {
    const config = await this.jitProvisioningService.getConfig(workspaceId);
    return this.toResponseDto(config);
  }

  /**
   * PUT /api/auth/sso/jit-config?workspaceId=...
   * Update the JIT provisioning configuration for a workspace.
   */
  @Put()
  @ApiOperation({ summary: 'Update JIT provisioning configuration' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiBody({ type: UpdateJitProvisioningConfigDto })
  @ApiResponse({ status: 200, type: JitProvisioningConfigResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid configuration values' })
  async updateConfig(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateJitProvisioningConfigDto,
    @Req() req: Request,
  ): Promise<JitProvisioningConfigResponseDto> {
    const actorId = (req as any).user?.id ?? (req as any).user?.sub ?? '';
    const config = await this.jitProvisioningService.updateConfig(workspaceId, dto, actorId);
    return this.toResponseDto(config);
  }

  /**
   * POST /api/auth/sso/jit-config/test-mapping?workspaceId=...
   * Test attribute mapping with sample IdP attributes.
   */
  @Post('test-mapping')
  @ApiOperation({ summary: 'Test JIT attribute mapping with sample data' })
  @ApiQuery({ name: 'workspaceId', required: true, type: String })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleAttributes: {
          type: 'object',
          description: 'Sample IdP attributes to test mapping against',
          example: {
            email: 'john@acme.com',
            given_name: 'John',
            family_name: 'Doe',
            groups: ['Engineering', 'Engineering Leads'],
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        extractedAttributes: { type: 'object' },
        resolvedRole: { type: 'string' },
        wouldCreateUser: { type: 'boolean' },
        wouldUpdateProfile: { type: 'boolean' },
        wouldUpdateRole: { type: 'boolean' },
      },
    },
  })
  async testMapping(
    @Query('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: { sampleAttributes: Record<string, unknown> },
  ): Promise<{
    extractedAttributes: ExtractedIdpAttributes;
    resolvedRole: string;
    wouldCreateUser: boolean;
    wouldUpdateProfile: boolean;
    wouldUpdateRole: boolean;
  }> {
    const config = await this.jitProvisioningService.getConfig(workspaceId);
    const sampleAttributes = body.sampleAttributes || {};
    const extracted = this.jitProvisioningService.extractAttributes(
      sampleAttributes,
      config.attributeMapping,
    );
    const resolvedRole = this.jitProvisioningService.resolveRole(
      extracted.groups,
      config.groupRoleMapping,
      config.defaultRole,
    );

    return {
      extractedAttributes: extracted,
      resolvedRole,
      wouldCreateUser: config.jitEnabled,
      wouldUpdateProfile: config.autoUpdateProfile,
      wouldUpdateRole: config.autoUpdateRoles,
    };
  }

  private toResponseDto(config: JitProvisioningConfig): JitProvisioningConfigResponseDto {
    const dto = new JitProvisioningConfigResponseDto();
    dto.id = config.id;
    dto.workspaceId = config.workspaceId;
    dto.jitEnabled = config.jitEnabled;
    dto.defaultRole = config.defaultRole;
    dto.autoUpdateProfile = config.autoUpdateProfile;
    dto.autoUpdateRoles = config.autoUpdateRoles;
    dto.welcomeEmail = config.welcomeEmail;
    dto.requireEmailDomains = config.requireEmailDomains;
    dto.attributeMapping = config.attributeMapping;
    dto.groupRoleMapping = config.groupRoleMapping;
    dto.conflictResolution = config.conflictResolution;
    dto.createdAt = config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt;
    dto.updatedAt = config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt;
    return dto;
  }
}
