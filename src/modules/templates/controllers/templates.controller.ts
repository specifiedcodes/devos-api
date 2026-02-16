import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TemplatesService } from '../services/templates.service';
import { TemplateResponseDto } from '../dto/template-response.dto';
import { TemplateCategory } from '../constants/template-registry.constant';

@ApiTags('Templates')
@Controller('api/v1/templates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all project templates',
    description:
      'Returns all available predefined project templates. No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all templates',
    type: [TemplateResponseDto],
  })
  getAllTemplates(): TemplateResponseDto[] {
    return this.templatesService.getAllTemplates();
  }

  @Get('category/:category')
  @ApiOperation({
    summary: 'Get templates by category',
    description:
      'Returns templates filtered by category. Returns empty array if no templates match.',
  })
  @ApiParam({
    name: 'category',
    description: 'Template category',
    enum: TemplateCategory,
    example: 'saas',
  })
  @ApiResponse({
    status: 200,
    description: 'Templates matching category',
    type: [TemplateResponseDto],
  })
  getTemplatesByCategory(
    @Param('category') category: TemplateCategory,
  ): TemplateResponseDto[] {
    return this.templatesService.getTemplatesByCategory(category);
  }

  @Get(':templateId')
  @ApiOperation({
    summary: 'Get template by ID',
    description:
      'Returns a single template by its unique identifier. Returns 404 if template not found.',
  })
  @ApiParam({
    name: 'templateId',
    description: 'Unique template identifier',
    example: 'nextjs-saas-starter',
  })
  @ApiResponse({
    status: 200,
    description: 'Template found',
    type: TemplateResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    schema: {
      example: {
        statusCode: 404,
        message: "Template with ID 'invalid-id' not found",
        error: 'Not Found',
      },
    },
  })
  getTemplateById(@Param('templateId') templateId: string): TemplateResponseDto {
    return this.templatesService.getTemplateById(templateId);
  }
}
