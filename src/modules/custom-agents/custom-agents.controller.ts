/**
 * CustomAgentsController
 *
 * Story 18-1: Agent Definition Schema
 *
 * REST API endpoints for custom agent definition CRUD, validation,
 * import/export, and metadata queries.
 *
 * Important: Static routes (/validate, /schema, /categories, /tools, /import)
 * are registered BEFORE dynamic /:definitionId routes to prevent Express
 * from treating static segments as UUID parameters.
 */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CustomAgentsService } from './custom-agents.service';
import { CreateAgentDefinitionDto } from './dto/create-agent-definition.dto';
import { UpdateAgentDefinitionDto } from './dto/update-agent-definition.dto';
import { ValidateAgentDefinitionDto } from './dto/validate-agent-definition.dto';
import { ListAgentDefinitionsQueryDto } from './dto/list-agent-definitions-query.dto';
import { ImportAgentDefinitionDto } from './dto/import-agent-definition.dto';
import { AgentDefinitionResponseDto, AgentDefinitionValidationResponseDto } from './dto/agent-definition-response.dto';
import { AgentDefinitionValidatorService } from './agent-definition-validator.service';
import { AGENT_DEFINITION_CONSTANTS } from './constants/agent-definition.constants';

@ApiTags('Custom Agents')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('api/workspaces/:workspaceId/agent-definitions')
export class CustomAgentsController {
  constructor(
    private readonly customAgentsService: CustomAgentsService,
    private readonly validatorService: AgentDefinitionValidatorService,
  ) {}

  // ---- Static routes FIRST (before :definitionId) ----

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate an agent definition without saving' })
  @ApiResponse({ status: 200, type: AgentDefinitionValidationResponseDto })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  async validate(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
    @Body() dto: ValidateAgentDefinitionDto,
  ): Promise<AgentDefinitionValidationResponseDto> {
    return this.customAgentsService.validateDefinition(dto);
  }

  @Get('schema')
  @ApiOperation({ summary: 'Get JSON Schema for agent definitions' })
  @ApiResponse({ status: 200, description: 'JSON Schema object' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'version', required: false, description: 'Schema version (default v1)' })
  getSchema(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
    @Query('version') version?: string,
  ): object {
    return this.validatorService.getSchemaForVersion(
      version || AGENT_DEFINITION_CONSTANTS.CURRENT_SCHEMA_VERSION,
    );
  }

  @Get('categories')
  @ApiOperation({ summary: 'List available agent categories' })
  @ApiResponse({ status: 200, description: 'Array of category strings' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  getCategories(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): readonly string[] {
    return AGENT_DEFINITION_CONSTANTS.CATEGORIES;
  }

  @Get('tools')
  @ApiOperation({ summary: 'List available tools and categories' })
  @ApiResponse({ status: 200, description: 'Object with tool categories and tools' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  getTools(
    @Param('workspaceId', ParseUUIDPipe) _workspaceId: string,
  ): Record<string, string[]> {
    return AGENT_DEFINITION_CONSTANTS.KNOWN_TOOL_CATEGORIES;
  }

  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Import an agent definition from YAML or JSON' })
  @ApiResponse({ status: 201, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid format or validation errors' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  async importDefinition(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() body: ImportAgentDefinitionDto,
    @Req() req: any,
  ): Promise<AgentDefinitionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;

    if (body.format === 'json') {
      return this.customAgentsService.importDefinitionFromJson(
        workspaceId,
        body.content,
        actorId,
      );
    }

    return this.customAgentsService.importDefinitionFromYaml(
      workspaceId,
      body.content,
      actorId,
    );
  }

  // ---- CRUD routes ----

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new agent definition' })
  @ApiResponse({ status: 201, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation errors' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 409, description: 'Name already exists' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateAgentDefinitionDto,
    @Req() req: any,
  ): Promise<AgentDefinitionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.customAgentsService.createDefinition(workspaceId, dto, actorId);
  }

  @Get()
  @ApiOperation({ summary: 'List agent definitions in workspace' })
  @ApiResponse({ status: 200, description: 'Paginated list of definitions' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: ListAgentDefinitionsQueryDto,
  ) {
    return this.customAgentsService.listDefinitions(workspaceId, query);
  }

  @Get(':definitionId')
  @ApiOperation({ summary: 'Get a specific agent definition' })
  @ApiResponse({ status: 200, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async getOne(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
  ): Promise<AgentDefinitionResponseDto> {
    return this.customAgentsService.getDefinition(workspaceId, definitionId);
  }

  @Put(':definitionId')
  @ApiOperation({ summary: 'Update an agent definition' })
  @ApiResponse({ status: 200, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation errors' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: UpdateAgentDefinitionDto,
    @Req() req: any,
  ): Promise<AgentDefinitionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.customAgentsService.updateDefinition(workspaceId, definitionId, dto, actorId);
  }

  @Delete(':definitionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an agent definition' })
  @ApiResponse({ status: 204, description: 'Definition deleted' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Req() req: any,
  ): Promise<void> {
    const actorId = req.user?.id || req.user?.userId;
    return this.customAgentsService.deleteDefinition(workspaceId, definitionId, actorId);
  }

  @Post(':definitionId/activate')
  @ApiOperation({ summary: 'Activate an agent definition' })
  @ApiResponse({ status: 200, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async activate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Req() req: any,
  ): Promise<AgentDefinitionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.customAgentsService.activateDefinition(workspaceId, definitionId, actorId);
  }

  @Post(':definitionId/deactivate')
  @ApiOperation({ summary: 'Deactivate an agent definition' })
  @ApiResponse({ status: 200, type: AgentDefinitionResponseDto })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async deactivate(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Req() req: any,
  ): Promise<AgentDefinitionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.customAgentsService.deactivateDefinition(workspaceId, definitionId, actorId);
  }

  @Get(':definitionId/export')
  @ApiOperation({ summary: 'Export an agent definition as YAML or JSON' })
  @ApiResponse({ status: 200, description: 'Exported definition' })
  @ApiResponse({ status: 404, description: 'Definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiQuery({ name: 'format', required: false, description: 'Export format (yaml or json)', enum: ['yaml', 'json'] })
  async exportDefinition(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Query('format') format: string = 'yaml',
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    if (format === 'json') {
      const json = await this.customAgentsService.exportDefinitionAsJson(workspaceId, definitionId);
      res.setHeader('Content-Type', 'application/json');
      return json;
    } else {
      const yamlStr = await this.customAgentsService.exportDefinitionAsYaml(workspaceId, definitionId);
      res.setHeader('Content-Type', 'text/yaml');
      return yamlStr;
    }
  }
}
