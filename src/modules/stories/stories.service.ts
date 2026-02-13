import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Story, StoryStatus } from '../../database/entities/story.entity';
import { Project } from '../../database/entities/project.entity';
import { RedisService } from '../redis/redis.service';
import {
  CreateStoryDto,
  UpdateStoryDto,
  UpdateStoryStatusDto,
  AssignStoryDto,
  StoryListQueryDto,
  StoryResponseDto,
  StoryListResponseDto,
} from './dto/story.dto';

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly redisService: RedisService,
  ) {}

  /**
   * List stories for a project with optional filters and pagination
   */
  async listStories(
    workspaceId: string,
    projectId: string,
    options: StoryListQueryDto,
  ): Promise<StoryListResponseDto> {
    this.logger.log(`Listing stories for project ${projectId} in workspace ${workspaceId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const page = options.page || 1;
    const perPage = options.perPage || 100;

    const queryBuilder = this.storyRepository
      .createQueryBuilder('story')
      .where('story.projectId = :projectId', { projectId })
      .leftJoinAndSelect('story.assignedAgent', 'agent');

    // Apply optional filters
    if (options.epicId) {
      queryBuilder.andWhere('story.epicId = :epicId', { epicId: options.epicId });
    }

    if (options.status) {
      queryBuilder.andWhere('story.status = :status', { status: options.status });
    }

    if (options.assignedAgentId) {
      queryBuilder.andWhere('story.assignedAgentId = :assignedAgentId', {
        assignedAgentId: options.assignedAgentId,
      });
    }

    if (options.priority) {
      queryBuilder.andWhere('story.priority = :priority', { priority: options.priority });
    }

    // Order by position ASC, then createdAt ASC
    queryBuilder.orderBy('story.position', 'ASC').addOrderBy('story.createdAt', 'ASC');

    // Apply pagination
    queryBuilder.skip((page - 1) * perPage).take(perPage);

    const [stories, total] = await queryBuilder.getManyAndCount();

    return {
      stories: stories.map((story) => this.mapToResponseDto(story)),
      total,
      page,
      perPage,
    };
  }

  /**
   * Get a single story by ID
   */
  async getStory(
    workspaceId: string,
    projectId: string,
    storyId: string,
  ): Promise<StoryResponseDto> {
    this.logger.log(`Getting story ${storyId} for project ${projectId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
      relations: ['assignedAgent'],
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    return this.mapToResponseDto(story);
  }

  /**
   * Create a new story
   */
  async createStory(
    workspaceId: string,
    projectId: string,
    dto: CreateStoryDto,
  ): Promise<StoryResponseDto> {
    this.logger.log(`Creating story "${dto.title}" for project ${projectId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get max position for backlog stories in this project
    const maxPositionResult = await this.storyRepository
      .createQueryBuilder('story')
      .select('MAX(story.position)', 'maxPosition')
      .where('story.projectId = :projectId', { projectId })
      .andWhere('story.status = :status', { status: StoryStatus.BACKLOG })
      .getRawOne();

    const nextPosition = (maxPositionResult?.maxPosition ?? -1) + 1;

    const story = this.storyRepository.create({
      ...dto,
      projectId,
      status: StoryStatus.BACKLOG,
      priority: dto.priority ?? undefined,
      position: nextPosition,
    });

    const savedStory = await this.storyRepository.save(story);
    this.logger.log(`Story created: ${savedStory.id}`);

    // Publish story:updated event for newly created story
    await this.publishStoryEvent('story:updated', projectId, {
      id: savedStory.id,
      projectId: savedStory.projectId,
      storyKey: savedStory.storyKey,
      title: savedStory.title,
      status: savedStory.status,
      priority: savedStory.priority,
      position: savedStory.position,
    });

    return this.mapToResponseDto(savedStory);
  }

  /**
   * Update a story's fields (title, description, priority, storyPoints, tags)
   */
  async updateStory(
    workspaceId: string,
    projectId: string,
    storyId: string,
    dto: UpdateStoryDto,
  ): Promise<StoryResponseDto> {
    this.logger.log(`Updating story ${storyId} in project ${projectId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
      relations: ['assignedAgent'],
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    // Update allowed fields
    if (dto.title !== undefined) story.title = dto.title;
    if (dto.description !== undefined) story.description = dto.description;
    if (dto.priority !== undefined) story.priority = dto.priority;
    if (dto.storyPoints !== undefined) story.storyPoints = dto.storyPoints;
    if (dto.tags !== undefined) story.tags = dto.tags;

    const updatedStory = await this.storyRepository.save(story);
    this.logger.log(`Story updated: ${updatedStory.id}`);

    // Publish story:updated event
    await this.publishStoryEvent('story:updated', projectId, {
      id: updatedStory.id,
      ...dto,
    });

    return this.mapToResponseDto(updatedStory);
  }

  /**
   * Update a story's status and recalculate position
   */
  async updateStoryStatus(
    workspaceId: string,
    projectId: string,
    storyId: string,
    dto: UpdateStoryStatusDto,
  ): Promise<StoryResponseDto> {
    this.logger.log(`Updating status of story ${storyId} to ${dto.status}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
      relations: ['assignedAgent'],
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    const previousStatus = story.status;
    story.status = dto.status;

    // Recalculate position: append to end of target column (exclude self to avoid self-increment)
    const maxPositionResult = await this.storyRepository
      .createQueryBuilder('story')
      .select('MAX(story.position)', 'maxPosition')
      .where('story.projectId = :projectId', { projectId })
      .andWhere('story.status = :status', { status: dto.status })
      .andWhere('story.id != :storyId', { storyId })
      .getRawOne();

    story.position = (maxPositionResult?.maxPosition ?? -1) + 1;

    const updatedStory = await this.storyRepository.save(story);
    this.logger.log(`Story ${storyId} status changed from ${previousStatus} to ${dto.status}`);

    // Publish story:status_changed event
    await this.publishStoryEvent('story:status_changed', projectId, {
      id: updatedStory.id,
      status: updatedStory.status,
      previousStatus,
      position: updatedStory.position,
    });

    return this.mapToResponseDto(updatedStory);
  }

  /**
   * Assign or unassign an agent to a story
   */
  async assignStory(
    workspaceId: string,
    projectId: string,
    storyId: string,
    dto: AssignStoryDto,
  ): Promise<StoryResponseDto> {
    this.logger.log(`Assigning agent ${dto.assignedAgentId ?? 'none'} to story ${storyId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    // Update assignedAgentId (null means unassign)
    // Use explicit null for TypeORM to set DB column to NULL (undefined would skip the update)
    story.assignedAgentId = dto.assignedAgentId === null ? (null as any) : dto.assignedAgentId;

    const savedStory = await this.storyRepository.save(story);

    // Reload with agent relation
    const updatedStory = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
      relations: ['assignedAgent'],
    });

    this.logger.log(`Story ${storyId} assigned to agent ${dto.assignedAgentId ?? 'none'}`);

    // Publish story:assigned event
    await this.publishStoryEvent('story:assigned', projectId, {
      id: savedStory.id,
      assignedAgentId: savedStory.assignedAgentId ?? null,
      assignedAgent: updatedStory?.assignedAgent
        ? {
            id: updatedStory.assignedAgent.id,
            name: updatedStory.assignedAgent.name,
            type: updatedStory.assignedAgent.type,
            status: updatedStory.assignedAgent.status,
          }
        : null,
    });

    return this.mapToResponseDto(updatedStory!);
  }

  /**
   * Delete a story
   */
  async deleteStory(
    workspaceId: string,
    projectId: string,
    storyId: string,
  ): Promise<void> {
    this.logger.log(`Deleting story ${storyId} from project ${projectId}`);

    // Validate project exists in workspace
    const project = await this.projectRepository.findOne({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const story = await this.storyRepository.findOne({
      where: { id: storyId, projectId },
    });

    if (!story) {
      throw new NotFoundException('Story not found');
    }

    await this.storyRepository.remove(story);
    this.logger.log(`Story deleted: ${storyId}`);

    // Publish story:deleted event
    await this.publishStoryEvent('story:deleted', projectId, {
      id: storyId,
    });
  }

  /**
   * Publish a story event to Redis pub/sub
   */
  private async publishStoryEvent(
    event: string,
    projectId: string,
    data: Record<string, any>,
    actorId?: string,
  ): Promise<void> {
    const payload = JSON.stringify({
      event,
      projectId,
      timestamp: new Date().toISOString(),
      data,
      ...(actorId ? { agentId: actorId } : {}),
    });
    await this.redisService.publish('story-events', payload);
    this.logger.log(`Published ${event} for project ${projectId}`);
  }

  /**
   * Map story entity to response DTO
   */
  private mapToResponseDto(story: Story): StoryResponseDto {
    const dto: StoryResponseDto = {
      id: story.id,
      projectId: story.projectId,
      epicId: story.epicId,
      sprintId: story.sprintId,
      storyKey: story.storyKey,
      title: story.title,
      description: story.description,
      status: story.status,
      priority: story.priority,
      storyPoints: story.storyPoints,
      position: story.position,
      tags: story.tags,
      assignedAgentId: story.assignedAgentId,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
    };

    if (story.assignedAgent) {
      dto.assignedAgent = {
        id: story.assignedAgent.id,
        name: story.assignedAgent.name,
        type: story.assignedAgent.type,
        status: story.assignedAgent.status,
      };
    }

    return dto;
  }
}
