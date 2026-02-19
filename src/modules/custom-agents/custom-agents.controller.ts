/**
 * CustomAgentsController
 *
 * Story 18-1: Agent Definition Schema
 * Story 18-3: Agent Sandbox Testing
 * Story 18-4: Agent Versioning
 *
 * REST API endpoints for custom agent definition CRUD, validation,
 * import/export, metadata queries, sandbox testing, and version management.
 *
 * Important: Static routes (/validate, /schema, /categories, /tools, /import, /sandbox)
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
import { AgentSandboxService } from './agent-sandbox.service';
import { AgentVersionService } from './agent-version.service';
import { CreateAgentDefinitionDto } from './dto/create-agent-definition.dto';
import { UpdateAgentDefinitionDto } from './dto/update-agent-definition.dto';
import { ValidateAgentDefinitionDto } from './dto/validate-agent-definition.dto';
import { ListAgentDefinitionsQueryDto } from './dto/list-agent-definitions-query.dto';
import { ImportAgentDefinitionDto } from './dto/import-agent-definition.dto';
import { AgentDefinitionResponseDto, AgentDefinitionValidationResponseDto } from './dto/agent-definition-response.dto';
import { CreateSandboxSessionDto } from './dto/create-sandbox-session.dto';
import {
  SandboxSessionResponseDto,
  SandboxSessionStatusDto,
  SandboxSessionResultsDto,
} from './dto/sandbox-session-response.dto';
import { SendSandboxMessageDto } from './dto/send-sandbox-message.dto';
import { TestScenarioDto, CreateTestScenarioDto } from './dto/create-test-scenario.dto';
import { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import { ListVersionsQueryDto } from './dto/list-versions-query.dto';
import {
  AgentVersionResponseDto,
  PaginatedVersionListDto,
  VersionDiffResponseDto,
} from './dto/agent-version-response.dto';
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
    private readonly sandboxService: AgentSandboxService,
    private readonly versionService: AgentVersionService,
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

  // ---- Sandbox Testing endpoints (Story 18-3) ----

  @Post(':definitionId/sandbox')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new sandbox session for testing' })
  @ApiResponse({ status: 201, type: SandboxSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Agent is inactive or session already exists' })
  @ApiResponse({ status: 404, description: 'Agent definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async createSandboxSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: CreateSandboxSessionDto,
    @Req() req: any,
  ): Promise<SandboxSessionResponseDto> {
    const userId = req.user?.id || req.user?.userId;
    return this.sandboxService.createSession(workspaceId, definitionId, userId, dto);
  }

  @Get(':definitionId/test-scenarios')
  @ApiOperation({ summary: 'List test scenarios for an agent' })
  @ApiResponse({ status: 200, type: [TestScenarioDto] })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async listTestScenarios(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
  ): Promise<TestScenarioDto[]> {
    return this.sandboxService.listTestScenarios(workspaceId, definitionId);
  }

  @Post(':definitionId/test-scenarios')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a custom test scenario' })
  @ApiResponse({ status: 201, type: TestScenarioDto })
  @ApiResponse({ status: 404, description: 'Agent definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  async createTestScenario(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: CreateTestScenarioDto,
    @Req() req: any,
  ): Promise<TestScenarioDto> {
    const userId = req.user?.id || req.user?.userId;
    return this.sandboxService.createTestScenario(workspaceId, definitionId, dto, userId);
  }

  // ---- Sandbox Session endpoints (using sandbox/:sessionId pattern) ----

  @Post('sandbox/:sessionId/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start sandbox execution' })
  @ApiResponse({ status: 200, description: 'Session started' })
  @ApiResponse({ status: 400, description: 'Session cannot be started' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  async startSandboxSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: any,
  ): Promise<void> {
    const userId = req.user?.id || req.user?.userId;
    return this.sandboxService.startSession(sessionId, userId);
  }

  @Post('sandbox/:sessionId/message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test message to sandbox agent' })
  @ApiResponse({ status: 200, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Session is not running' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  async sendSandboxMessage(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SendSandboxMessageDto,
  ): Promise<void> {
    return this.sandboxService.sendTestMessage(sessionId, dto.message, dto.inputs);
  }

  @Get('sandbox/:sessionId')
  @ApiOperation({ summary: 'Get sandbox session status' })
  @ApiResponse({ status: 200, type: SandboxSessionStatusDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  async getSandboxStatus(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SandboxSessionStatusDto> {
    return this.sandboxService.getSessionStatus(sessionId);
  }

  @Post('sandbox/:sessionId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel sandbox session' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  @ApiResponse({ status: 400, description: 'Session cannot be cancelled' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  async cancelSandboxSession(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: any,
  ): Promise<void> {
    const userId = req.user?.id || req.user?.userId;
    return this.sandboxService.cancelSession(sessionId, userId);
  }

  @Get('sandbox/:sessionId/results')
  @ApiOperation({ summary: 'Get sandbox session results' })
  @ApiResponse({ status: 200, type: SandboxSessionResultsDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'sessionId', type: 'string', format: 'uuid' })
  async getSandboxResults(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SandboxSessionResultsDto> {
    return this.sandboxService.getSessionResults(sessionId);
  }

  // ---- Version Management endpoints (Story 18-4) ----

  @Get(':definitionId/versions')
  @ApiOperation({ summary: 'List all versions for an agent definition' })
  @ApiResponse({ status: 200, type: PaginatedVersionListDto })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiBearerAuth('JWT-auth')
  async listVersions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Query() query: ListVersionsQueryDto,
  ): Promise<PaginatedVersionListDto> {
    return this.versionService.listVersions(workspaceId, definitionId, query);
  }

  @Post(':definitionId/versions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new version from current definition' })
  @ApiResponse({ status: 201, type: AgentVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid version or validation failed' })
  @ApiResponse({ status: 404, description: 'Agent definition not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiBearerAuth('JWT-auth')
  async createVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Body() dto: CreateAgentVersionDto,
    @Req() req: any,
  ): Promise<AgentVersionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.versionService.createVersion(workspaceId, definitionId, dto, actorId);
  }

  @Get(':definitionId/versions/:version')
  @ApiOperation({ summary: 'Get a specific version' })
  @ApiResponse({ status: 200, type: AgentVersionResponseDto })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'version', type: 'string', description: 'Semver version (e.g., 1.2.0)' })
  @ApiBearerAuth('JWT-auth')
  async getVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('version') version: string,
  ): Promise<AgentVersionResponseDto> {
    return this.versionService.getVersion(workspaceId, definitionId, version);
  }

  @Get(':definitionId/versions/:fromVersion/compare/:toVersion')
  @ApiOperation({ summary: 'Compare two versions and get diff' })
  @ApiResponse({ status: 200, type: VersionDiffResponseDto })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'fromVersion', type: 'string', description: 'Source version' })
  @ApiParam({ name: 'toVersion', type: 'string', description: 'Target version' })
  @ApiBearerAuth('JWT-auth')
  async compareVersions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('fromVersion') fromVersion: string,
    @Param('toVersion') toVersion: string,
  ): Promise<VersionDiffResponseDto> {
    return this.versionService.compareVersions(workspaceId, definitionId, fromVersion, toVersion);
  }

  @Post(':definitionId/versions/:version/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a version' })
  @ApiResponse({ status: 200, type: AgentVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Version already published' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'version', type: 'string' })
  @ApiBearerAuth('JWT-auth')
  async publishVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('version') version: string,
    @Req() req: any,
  ): Promise<AgentVersionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.versionService.publishVersion(workspaceId, definitionId, version, actorId);
  }

  @Post(':definitionId/versions/:version/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rollback to a specific version' })
  @ApiResponse({ status: 200, type: AgentVersionResponseDto })
  @ApiResponse({ status: 400, description: 'Cannot rollback to current version' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  @ApiParam({ name: 'workspaceId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'definitionId', type: 'string', format: 'uuid' })
  @ApiParam({ name: 'version', type: 'string' })
  @ApiBearerAuth('JWT-auth')
  async rollbackToVersion(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('definitionId', ParseUUIDPipe) definitionId: string,
    @Param('version') targetVersion: string,
    @Req() req: any,
  ): Promise<AgentVersionResponseDto> {
    const actorId = req.user?.id || req.user?.userId;
    return this.versionService.rollbackToVersion(workspaceId, definitionId, targetVersion, actorId);
  }
}
