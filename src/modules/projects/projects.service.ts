import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Project, ProjectStatus } from '../../database/entities/project.entity';
import {
  ProjectPreferences,
  VALID_MODELS_BY_PROVIDER,
  AiProvider,
  DEFAULT_AI_PROVIDER,
  DEFAULT_AI_MODEL,
} from '../../database/entities/project-preferences.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectPreferencesDto } from './dto/create-project-preferences.dto';
import { UpdateProjectPreferencesDto } from './dto/update-project-preferences.dto';
import { UpdateAiConfigDto, AiConfigResponseDto } from './dto/update-ai-config.dto';
import { AuditService, AuditAction } from '../../shared/audit/audit.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectPreferences)
    private readonly preferencesRepository: Repository<ProjectPreferences>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new project within a workspace
   * @param userId - User ID creating the project
   * @param workspaceId - Workspace ID to create project in
   * @param createDto - Project creation data
   * @param preferencesDto - Optional project preferences
   * @returns Created project
   */
  async create(
    userId: string,
    workspaceId: string,
    createDto: CreateProjectDto,
    preferencesDto?: CreateProjectPreferencesDto,
  ): Promise<Project> {
    this.logger.log(
      `Creating project "${createDto.name}" in workspace ${workspaceId} by user ${userId}`,
    );

    // Check project name uniqueness within workspace
    const existing = await this.projectRepository.findOne({
      where: {
        workspaceId,
        name: createDto.name,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Project with this name already exists in workspace',
      );
    }

    // Use transaction to create project + preferences atomically
    return await this.dataSource.transaction(async (manager) => {
      const project = manager.create(Project, {
        ...createDto,
        workspaceId,
        createdByUserId: userId,
        status: ProjectStatus.ACTIVE,
      });

      const savedProject = await manager.save(Project, project);
      this.logger.log(`Project created: ${savedProject.id}`);

      // Create default preferences if not provided
      const preferences = manager.create(ProjectPreferences, {
        projectId: savedProject.id,
        ...(preferencesDto || {}),
      });

      await manager.save(ProjectPreferences, preferences);
      this.logger.log(`Project preferences created for project ${savedProject.id}`);

      // Reload project with preferences
      const projectWithPreferences = await manager.findOne(Project, {
        where: { id: savedProject.id },
        relations: ['preferences', 'createdBy'],
      });

      // Log to audit log (Task 5.1) - after transaction completes
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.PROJECT_CREATED,
        'project',
        savedProject.id,
        {
          projectName: savedProject.name,
          description: savedProject.description,
        },
      );

      return projectWithPreferences!;
    });
  }

  /**
   * Find all projects in a workspace
   * @param workspaceId - Workspace ID to find projects in
   * @returns Array of projects
   */
  async findAllByWorkspace(workspaceId: string): Promise<Project[]> {
    return this.projectRepository.find({
      where: { workspaceId, status: ProjectStatus.ACTIVE },
      relations: ['createdBy', 'preferences'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a single project by ID with workspace isolation
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID for isolation
   * @returns Found project
   * @throws NotFoundException if project not found
   */
  async findOne(projectId: string, workspaceId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
      relations: ['createdBy', 'preferences'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Update a project
   * @param projectId - Project ID to update
   * @param workspaceId - Workspace ID for isolation
   * @param updateDto - Update data
   * @returns Updated project
   */
  async update(
    projectId: string,
    workspaceId: string,
    updateDto: UpdateProjectDto,
    userId?: string,
  ): Promise<Project> {
    const project = await this.findOne(projectId, workspaceId);

    // Check name uniqueness if name is being changed
    if (updateDto.name && updateDto.name !== project.name) {
      const existing = await this.projectRepository.findOne({
        where: { workspaceId, name: updateDto.name },
      });

      if (existing) {
        throw new ConflictException('Project with this name already exists');
      }
    }

    // Track changes for audit log
    const changes: Record<string, any> = {};
    Object.keys(updateDto).forEach((key) => {
      const projectKey = key as keyof Project;
      const updateKey = key as keyof UpdateProjectDto;
      if ((project as any)[projectKey] !== (updateDto as any)[updateKey]) {
        changes[key] = { old: (project as any)[projectKey], new: (updateDto as any)[updateKey] };
      }
    });

    Object.assign(project, updateDto);
    const updated = await this.projectRepository.save(project);
    this.logger.log(`Project ${projectId} updated`);

    // Log to audit log (Task 5.2)
    if (userId) {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.PROJECT_UPDATED,
        'project',
        projectId,
        {
          projectName: project.name,
          changes,
        },
      );
    }

    return this.findOne(projectId, workspaceId);
  }

  /**
   * Soft delete a project
   * @param projectId - Project ID to delete
   * @param workspaceId - Workspace ID for isolation
   * @param userId - User performing deletion
   */
  async softDelete(
    projectId: string,
    workspaceId: string,
    userId?: string,
  ): Promise<void> {
    const project = await this.findOne(projectId, workspaceId);
    const projectName = project.name;
    await this.projectRepository.softRemove(project);
    this.logger.log(`Project ${projectId} soft deleted`);

    // Log to audit log (Task 5.3)
    if (userId) {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.PROJECT_DELETED,
        'project',
        projectId,
        {
          projectName,
        },
      );
    }
  }

  /**
   * Archive a project
   * @param projectId - Project ID to archive
   * @param workspaceId - Workspace ID for isolation
   * @param userId - User performing archival
   * @returns Archived project
   */
  async archive(
    projectId: string,
    workspaceId: string,
    userId?: string,
  ): Promise<Project> {
    const project = await this.findOne(projectId, workspaceId);
    project.status = ProjectStatus.ARCHIVED;
    const archived = await this.projectRepository.save(project);
    this.logger.log(`Project ${projectId} archived`);

    // Log to audit log (Task 5.4)
    if (userId) {
      await this.auditService.log(
        workspaceId,
        userId,
        AuditAction.PROJECT_ARCHIVED,
        'project',
        projectId,
        {
          projectName: project.name,
        },
      );
    }

    return archived;
  }

  /**
   * Update project preferences
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID for isolation
   * @param preferencesDto - Preferences update data
   * @returns Updated preferences
   */
  async updatePreferences(
    projectId: string,
    workspaceId: string,
    preferencesDto: UpdateProjectPreferencesDto,
  ): Promise<ProjectPreferences> {
    const project = await this.findOne(projectId, workspaceId);

    if (!project.preferences) {
      throw new NotFoundException('Project preferences not found');
    }

    Object.assign(project.preferences, preferencesDto);
    const updated = await this.preferencesRepository.save(project.preferences);
    this.logger.log(`Project ${projectId} preferences updated`);
    return updated;
  }

  /**
   * Get AI configuration for a project
   * Returns the current AI provider and model, or defaults if not set.
   *
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID for isolation
   * @returns AI configuration (provider + model)
   */
  async getAiConfig(
    projectId: string,
    workspaceId: string,
  ): Promise<AiConfigResponseDto> {
    const project = await this.findOne(projectId, workspaceId);

    if (!project.preferences) {
      return {
        aiProvider: DEFAULT_AI_PROVIDER,
        aiModel: DEFAULT_AI_MODEL,
      };
    }

    return {
      aiProvider: project.preferences.aiProvider || DEFAULT_AI_PROVIDER,
      aiModel: project.preferences.aiModel || DEFAULT_AI_MODEL,
    };
  }

  /**
   * Update AI configuration for a project
   * Validates that the model is valid for the chosen provider.
   *
   * @param projectId - Project ID
   * @param workspaceId - Workspace ID for isolation
   * @param dto - AI config update data (provider + model)
   * @returns Updated AI configuration
   * @throws BadRequestException if model is invalid for provider
   * @throws NotFoundException if project not found
   */
  async updateAiConfig(
    projectId: string,
    workspaceId: string,
    dto: UpdateAiConfigDto,
  ): Promise<AiConfigResponseDto> {
    // Validate model is valid for the chosen provider
    const provider = dto.aiProvider as AiProvider;
    const validModels = VALID_MODELS_BY_PROVIDER[provider];

    if (!validModels) {
      throw new BadRequestException(
        `Invalid AI provider: ${dto.aiProvider}. Valid providers: ${Object.values(AiProvider).join(', ')}`,
      );
    }

    if (!validModels.includes(dto.aiModel)) {
      throw new BadRequestException(
        `Invalid model "${dto.aiModel}" for provider "${dto.aiProvider}". Valid models: ${validModels.join(', ')}`,
      );
    }

    const project = await this.findOne(projectId, workspaceId);

    if (!project.preferences) {
      throw new NotFoundException('Project preferences not found');
    }

    project.preferences.aiProvider = dto.aiProvider;
    project.preferences.aiModel = dto.aiModel;

    await this.preferencesRepository.save(project.preferences);
    this.logger.log(
      `Project ${projectId} AI config updated: provider=${dto.aiProvider}, model=${dto.aiModel}`,
    );

    return {
      aiProvider: dto.aiProvider,
      aiModel: dto.aiModel,
    };
  }
}
