/**
 * AdminFeaturedTemplatesController
 *
 * Story 19-8: Featured Templates Curation
 *
 * Admin endpoints for managing featured templates.
 * All endpoints require platform admin access.
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { AdminFeaturedTemplatesService } from '../services/admin-featured-templates.service';
import {
  FeatureTemplateDto,
  ReorderFeaturedTemplatesDto,
  FeaturedTemplateResponseDto,
  FeaturedTemplatesListResponseDto,
  ListFeaturedTemplatesQueryDto,
} from '../../templates/dto/featured-template.dto';
import { TemplateTestStatus } from '../../../database/entities/template.entity';

@ApiTags('Admin - Featured Templates')
@ApiBearerAuth('JWT-auth')
@Controller('api/admin/templates/featured')
export class AdminFeaturedTemplatesController {
  constructor(
    private readonly featuredTemplatesService: AdminFeaturedTemplatesService,
  ) {}

  /**
   * GET /api/admin/templates/featured
   * List all featured templates
   */
  @Get()
  @PlatformAdmin()
  @ApiOperation({
    summary: 'List all featured templates',
    description: 'Returns all currently featured templates with their test status and details.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of featured templates',
    type: FeaturedTemplatesListResponseDto,
  })
  async listFeatured(
    @Query() query: ListFeaturedTemplatesQueryDto,
  ): Promise<FeaturedTemplatesListResponseDto> {
    return this.featuredTemplatesService.listFeatured(query);
  }

  /**
   * GET /api/admin/templates/featured/eligible
   * Get templates eligible for featuring
   */
  @Get('eligible')
  @PlatformAdmin()
  @ApiOperation({
    summary: 'Get templates eligible for featuring',
    description: 'Returns published templates that are not yet featured, sorted by rating and usage.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of templates to return (default: 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of eligible templates',
    type: [FeaturedTemplateResponseDto],
  })
  async getEligibleTemplates(
    @Query('limit') limit?: string,
  ): Promise<FeaturedTemplateResponseDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.featuredTemplatesService.getEligibleTemplates(parsedLimit);
  }

  /**
   * POST /api/admin/templates/:id/feature
   * Feature a template
   */
  @Post(':id/feature')
  @PlatformAdmin()
  @ApiOperation({
    summary: 'Feature a template',
    description: 'Marks a template as featured. Template must be published and active. Maximum 8 featured templates allowed.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template featured successfully',
    type: FeaturedTemplateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Template is not published/active or maximum featured templates reached',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Template is already featured',
  })
  async featureTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @Body() dto: FeatureTemplateDto,
    @Request() req: any,
  ): Promise<FeaturedTemplateResponseDto> {
    const adminId = req.user?.userId || req.user?.id;
    if (!adminId) {
      throw new UnauthorizedException('Admin user ID not found in request');
    }
    return this.featuredTemplatesService.featureTemplate(templateId, dto, adminId);
  }

  /**
   * POST /api/admin/templates/:id/unfeature
   * Unfeature a template
   */
  @Post(':id/unfeature')
  @PlatformAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfeature a template',
    description: 'Removes a template from the featured list.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template unfeatured successfully',
    type: FeaturedTemplateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Template is not featured',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async unfeatureTemplate(
    @Param('id', ParseUUIDPipe) templateId: string,
    @Request() req: any,
  ): Promise<FeaturedTemplateResponseDto> {
    const adminId = req.user?.userId || req.user?.id;
    if (!adminId) {
      throw new UnauthorizedException('Admin user ID not found in request');
    }
    return this.featuredTemplatesService.unfeatureTemplate(templateId, adminId);
  }

  /**
   * PUT /api/admin/templates/featured/reorder
   * Reorder featured templates
   */
  @Put('reorder')
  @PlatformAdmin()
  @ApiOperation({
    summary: 'Reorder featured templates',
    description: 'Updates the display order of featured templates. Provide either templateIds array (sequential order) or items array (explicit positions).',
  })
  @ApiResponse({
    status: 200,
    description: 'Templates reordered successfully',
    type: FeaturedTemplatesListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order or non-featured templates in list',
  })
  @ApiResponse({
    status: 404,
    description: 'One or more templates not found',
  })
  async reorderTemplates(
    @Body() dto: ReorderFeaturedTemplatesDto,
    @Request() req: any,
  ): Promise<FeaturedTemplatesListResponseDto> {
    const adminId = req.user?.userId || req.user?.id;
    if (!adminId) {
      throw new UnauthorizedException('Admin user ID not found in request');
    }
    return this.featuredTemplatesService.reorderFeaturedTemplates(dto, adminId);
  }

  /**
   * POST /api/admin/templates/:id/test-status
   * Update test status (internal/scheduled job use)
   */
  @Post(':id/test-status')
  @PlatformAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Update template test status',
    description: 'Updates the test status for a featured template. Typically called by automated test jobs.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
  })
  @ApiResponse({
    status: 204,
    description: 'Test status updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
  })
  async updateTestStatus(
    @Param('id', ParseUUIDPipe) templateId: string,
    @Body() body: { passing: boolean; errorMessage?: string },
    @Request() req: any,
  ): Promise<void> {
    const actorId = req.user?.userId || req.user?.id;
    await this.featuredTemplatesService.updateTestStatus(
      templateId,
      body.passing,
      body.errorMessage,
      actorId,
    );
  }
}
