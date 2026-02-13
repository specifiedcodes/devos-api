import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sprint, SprintStatus } from '../../database/entities/sprint.entity';
import { Story, StoryStatus } from '../../database/entities/story.entity';
import { Project } from '../../database/entities/project.entity';
import { RedisService } from '../redis/redis.service';
import {
  CreateSprintDto,
  UpdateSprintDto,
  StartSprintDto,
  SprintResponseDto,
  SprintListResponseDto,
} from './dto/sprint.dto';

@Injectable()
export class SprintsService {
  private readonly logger = new Logger(SprintsService.name);

  constructor(
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Validate project exists in workspace
   */
  private async validateProject(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /**
   * Find a sprint by ID and validate it belongs to the project
   */
  private async findSprint(projectId: string, sprintId: string): Promise<Sprint> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }
    return sprint;
  }

  /**
   * Compute story counts and points for a sprint
   */
  private async computeSprintMetrics(sprintId: string): Promise<{
    storyCount: number;
    completedStoryCount: number;
    totalPoints: number;
    completedPoints: number;
  }> {
    const stories = await this.storyRepository.find({
      where: { sprintId },
    });

    const storyCount = stories.length;
    const completedStories = stories.filter((s) => s.status === StoryStatus.DONE);
    const completedStoryCount = completedStories.length;
    const totalPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const completedPoints = completedStories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);

    return { storyCount, completedStoryCount, totalPoints, completedPoints };
  }

  /**
   * Map sprint entity to response DTO
   */
  private async mapToResponseDto(sprint: Sprint): Promise<SprintResponseDto> {
    const metrics = await this.computeSprintMetrics(sprint.id);

    return {
      id: sprint.id,
      projectId: sprint.projectId,
      sprintNumber: sprint.sprintNumber,
      name: sprint.name,
      goal: sprint.goal,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      capacity: sprint.capacity,
      status: sprint.status,
      completedAt: sprint.completedAt ? sprint.completedAt.toISOString() : undefined,
      storyCount: metrics.storyCount,
      completedStoryCount: metrics.completedStoryCount,
      totalPoints: metrics.totalPoints,
      completedPoints: metrics.completedPoints,
      createdAt: sprint.createdAt.toISOString(),
      updatedAt: sprint.updatedAt.toISOString(),
    };
  }

  /**
   * List all sprints for a project ordered by sprintNumber DESC
   */
  async listSprints(
    workspaceId: string,
    projectId: string,
  ): Promise<SprintListResponseDto> {
    this.logger.log(`Listing sprints for project ${projectId} in workspace ${workspaceId}`);

    await this.validateProject(workspaceId, projectId);

    const sprints = await this.sprintRepository.find({
      where: { projectId },
      order: { sprintNumber: 'DESC' },
    });

    const sprintDtos = await Promise.all(
      sprints.map((sprint) => this.mapToResponseDto(sprint)),
    );

    return {
      sprints: sprintDtos,
      total: sprints.length,
    };
  }

  /**
   * Get a single sprint by ID with computed story counts/points
   */
  async getSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Getting sprint ${sprintId} for project ${projectId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    return this.mapToResponseDto(sprint);
  }

  /**
   * Create a new sprint for a project
   */
  async createSprint(
    workspaceId: string,
    projectId: string,
    dto: CreateSprintDto,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Creating sprint for project ${projectId}`);

    await this.validateProject(workspaceId, projectId);

    // Auto-generate sprintNumber (max + 1)
    const maxResult = await this.sprintRepository
      .createQueryBuilder('sprint')
      .select('MAX(sprint.sprintNumber)', 'maxNumber')
      .where('sprint.projectId = :projectId', { projectId })
      .getRawOne();

    const sprintNumber = (maxResult?.maxNumber ?? 0) + 1;

    // Auto-generate name if not provided
    const name = dto.name || `Sprint ${sprintNumber}`;

    const sprint = this.sprintRepository.create({
      projectId,
      sprintNumber,
      name,
      goal: dto.goal,
      startDate: dto.startDate,
      endDate: dto.endDate,
      capacity: dto.capacity,
      status: SprintStatus.PLANNED,
    });

    const savedSprint = await this.sprintRepository.save(sprint);
    this.logger.log(`Sprint created: ${savedSprint.id} (Sprint ${sprintNumber})`);

    // Publish event
    await this.publishSprintEvent('sprint:created', projectId, {
      id: savedSprint.id,
      sprintNumber: savedSprint.sprintNumber,
      name: savedSprint.name,
      status: savedSprint.status,
    });

    return this.mapToResponseDto(savedSprint);
  }

  /**
   * Update a sprint (only allowed when status is 'planned')
   */
  async updateSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
    dto: UpdateSprintDto,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Updating sprint ${sprintId} in project ${projectId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    if (sprint.status === SprintStatus.COMPLETED) {
      throw new BadRequestException('Cannot update a completed sprint');
    }

    // For active sprints, only allow name and goal changes
    if (sprint.status === SprintStatus.ACTIVE) {
      if (dto.startDate !== undefined || dto.endDate !== undefined || dto.capacity !== undefined) {
        throw new BadRequestException(
          'Only name and goal can be updated for an active sprint',
        );
      }
    }

    if (dto.name !== undefined) sprint.name = dto.name;
    if (dto.goal !== undefined) sprint.goal = dto.goal;
    if (dto.startDate !== undefined) sprint.startDate = dto.startDate;
    if (dto.endDate !== undefined) sprint.endDate = dto.endDate;
    if (dto.capacity !== undefined) sprint.capacity = dto.capacity;

    const updatedSprint = await this.sprintRepository.save(sprint);
    this.logger.log(`Sprint updated: ${updatedSprint.id}`);

    await this.publishSprintEvent('sprint:updated', projectId, {
      id: updatedSprint.id,
      name: updatedSprint.name,
      status: updatedSprint.status,
    });

    return this.mapToResponseDto(updatedSprint);
  }

  /**
   * Start a sprint (sets status to active)
   */
  async startSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
    dto: StartSprintDto,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Starting sprint ${sprintId} in project ${projectId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    if (sprint.status !== SprintStatus.PLANNED) {
      throw new BadRequestException('Only planned sprints can be started');
    }

    // Validate no other active sprint exists
    const activeSprint = await this.sprintRepository.findOne({
      where: { projectId, status: SprintStatus.ACTIVE },
    });

    if (activeSprint) {
      throw new ConflictException(
        `Another sprint is already active: "${activeSprint.name}"`,
      );
    }

    // Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    sprint.status = SprintStatus.ACTIVE;
    sprint.startDate = dto.startDate;
    sprint.endDate = dto.endDate;

    const updatedSprint = await this.sprintRepository.save(sprint);
    this.logger.log(`Sprint started: ${updatedSprint.id}`);

    await this.publishSprintEvent('sprint:started', projectId, {
      id: updatedSprint.id,
      name: updatedSprint.name,
      status: updatedSprint.status,
      startDate: updatedSprint.startDate,
      endDate: updatedSprint.endDate,
    });

    return this.mapToResponseDto(updatedSprint);
  }

  /**
   * Complete a sprint (sets status to completed, returns incomplete stories to backlog)
   */
  async completeSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Completing sprint ${sprintId} in project ${projectId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    if (sprint.status !== SprintStatus.ACTIVE) {
      throw new BadRequestException('Only active sprints can be completed');
    }

    // Move incomplete stories back to unassigned backlog
    await this.storyRepository
      .createQueryBuilder()
      .update(Story)
      .set({ sprintId: null as unknown as string })
      .where('sprintId = :sprintId', { sprintId })
      .andWhere('status != :doneStatus', { doneStatus: StoryStatus.DONE })
      .execute();

    sprint.status = SprintStatus.COMPLETED;
    sprint.completedAt = new Date();

    const updatedSprint = await this.sprintRepository.save(sprint);
    this.logger.log(`Sprint completed: ${updatedSprint.id}`);

    await this.publishSprintEvent('sprint:completed', projectId, {
      id: updatedSprint.id,
      name: updatedSprint.name,
      status: updatedSprint.status,
    });

    return this.mapToResponseDto(updatedSprint);
  }

  /**
   * Delete a sprint (only allowed when status is 'planned')
   */
  async deleteSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
  ): Promise<void> {
    this.logger.log(`Deleting sprint ${sprintId} from project ${projectId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    if (sprint.status !== SprintStatus.PLANNED) {
      throw new BadRequestException('Only planned sprints can be deleted');
    }

    // Unassign all stories from this sprint
    await this.storyRepository
      .createQueryBuilder()
      .update(Story)
      .set({ sprintId: null as unknown as string })
      .where('sprintId = :sprintId', { sprintId })
      .execute();

    await this.sprintRepository.remove(sprint);
    this.logger.log(`Sprint deleted: ${sprintId}`);

    await this.publishSprintEvent('sprint:deleted', projectId, {
      id: sprintId,
    });
  }

  /**
   * Add a story to a sprint
   */
  async addStoryToSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
    storyId: string,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Adding story ${storyId} to sprint ${sprintId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    // Validate story belongs to the project
    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    story.sprintId = sprintId;
    await this.storyRepository.save(story);
    this.logger.log(`Story ${storyId} added to sprint ${sprintId}`);

    await this.publishSprintEvent('sprint:story_added', projectId, {
      sprintId,
      storyId,
    });

    return this.mapToResponseDto(sprint);
  }

  /**
   * Remove a story from a sprint
   */
  async removeStoryFromSprint(
    workspaceId: string,
    projectId: string,
    sprintId: string,
    storyId: string,
  ): Promise<SprintResponseDto> {
    this.logger.log(`Removing story ${storyId} from sprint ${sprintId}`);

    await this.validateProject(workspaceId, projectId);
    const sprint = await this.findSprint(projectId, sprintId);

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId, sprintId },
    });

    if (!story) {
      throw new NotFoundException('Story not found in this sprint');
    }

    story.sprintId = undefined;
    await this.storyRepository.save(story);
    this.logger.log(`Story ${storyId} removed from sprint ${sprintId}`);

    await this.publishSprintEvent('sprint:story_removed', projectId, {
      sprintId,
      storyId,
    });

    return this.mapToResponseDto(sprint);
  }

  /**
   * Publish a sprint event to Redis pub/sub
   */
  private async publishSprintEvent(
    event: string,
    projectId: string,
    data: Record<string, any>,
  ): Promise<void> {
    const payload = JSON.stringify({
      event,
      projectId,
      timestamp: new Date().toISOString(),
      data,
    });
    await this.redisService.publish('sprint-events', payload);
    this.logger.log(`Published ${event} for project ${projectId}`);
  }
}
