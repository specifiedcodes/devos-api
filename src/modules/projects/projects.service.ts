import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Project, ProjectStatus } from '../../database/entities/project.entity';
import { ProjectPreferences } from '../../database/entities/project-preferences.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectPreferencesDto } from './dto/create-project-preferences.dto';
import { UpdateProjectPreferencesDto } from './dto/update-project-preferences.dto';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectPreferences)
    private readonly preferencesRepository: Repository<ProjectPreferences>,
    private readonly dataSource: DataSource,
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

    Object.assign(project, updateDto);
    const updated = await this.projectRepository.save(project);
    this.logger.log(`Project ${projectId} updated`);

    return this.findOne(projectId, workspaceId);
  }

  /**
   * Soft delete a project
   * @param projectId - Project ID to delete
   * @param workspaceId - Workspace ID for isolation
   */
  async softDelete(projectId: string, workspaceId: string): Promise<void> {
    const project = await this.findOne(projectId, workspaceId);
    await this.projectRepository.softRemove(project);
    this.logger.log(`Project ${projectId} soft deleted`);
  }

  /**
   * Archive a project
   * @param projectId - Project ID to archive
   * @param workspaceId - Workspace ID for isolation
   * @returns Archived project
   */
  async archive(projectId: string, workspaceId: string): Promise<Project> {
    const project = await this.findOne(projectId, workspaceId);
    project.status = ProjectStatus.ARCHIVED;
    const archived = await this.projectRepository.save(project);
    this.logger.log(`Project ${projectId} archived`);
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
}
