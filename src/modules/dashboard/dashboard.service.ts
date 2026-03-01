import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Agent } from '../../database/entities/agent.entity';
import { Project } from '../../database/entities/project.entity';
import { Story } from '../../database/entities/story.entity';
import { IntegrationConnection } from '../../database/entities/integration-connection.entity';
import {
  DashboardStatsDto,
  ActivityFeedItemDto,
  AgentStatusDto,
  QuickStatsDto,
  ActiveProjectDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    @InjectRepository(IntegrationConnection)
    private readonly integrationRepository: Repository<IntegrationConnection>
  ) {}

  async getDashboardStats(workspaceId: string): Promise<DashboardStatsDto> {
    const activeProject = await this.getActiveProject(workspaceId);
    const agentStats = await this.getAgentStats(workspaceId);
    const quickStats = await this.getQuickStats(workspaceId);

    return {
      activeProject,
      agentStats,
      quickStats,
    };
  }

  async getActivityFeed(
    workspaceId: string,
    limit: number = 20
  ): Promise<ActivityFeedItemDto[]> {
    const activities: ActivityFeedItemDto[] = [];

    const recentAgents = await this.agentRepository.find({
      where: { workspaceId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    for (const agent of recentAgents) {
      activities.push({
        id: `agent-${agent.id}-${Date.now()}`,
        type: 'agent_status_change',
        message: `${agent.name} status changed to ${agent.status}`,
        timestamp: agent.updatedAt.toISOString(),
        metadata: {
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.type,
          status: agent.status,
        },
      });
    }

    activities.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return activities.slice(0, limit);
  }

  private async getActiveProject(workspaceId: string): Promise<ActiveProjectDto | null> {
    const project = await this.projectRepository.findOne({
      where: { workspaceId, status: 'active' },
      order: { updatedAt: 'DESC' },
    });

    if (!project) {
      return null;
    }

    const totalStories = await this.storyRepository.count({
      where: { projectId: project.id },
    });

    const completedStories = await this.storyRepository
      .createQueryBuilder('story')
      .where('story.projectId = :projectId', { projectId: project.id })
      .andWhere('story.status = :status', { status: 'done' })
      .getCount();

    const sprintProgress = totalStories > 0 
      ? Math.round((completedStories / totalStories) * 100)
      : 0;

    return {
      id: project.id,
      name: project.name,
      sprintProgress,
    };
  }

  private async getAgentStats(workspaceId: string): Promise<AgentStatusDto[]> {
    const agents = await this.agentRepository.find({
      where: { workspaceId },
      order: { updatedAt: 'DESC' },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      currentTask: agent.currentTaskId 
        ? `Task ${agent.currentTaskId}` 
        : undefined,
    }));
  }

  private async getQuickStats(workspaceId: string): Promise<QuickStatsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const storiesCompletedToday = await this.storyRepository
      .createQueryBuilder('story')
      .innerJoin('story.project', 'project')
      .where('project.workspaceId = :workspaceId', { workspaceId })
      .andWhere('story.status = :status', { status: 'done' })
      .andWhere('story.updatedAt >= :today', { today })
      .getCount();

    const deployments = await this.integrationRepository.count({
      where: { workspaceId, status: 'active' },
    });

    const costs = await this.calculateCosts(workspaceId);

    return {
      storiesCompletedToday,
      deployments,
      costs,
    };
  }

  private async calculateCosts(workspaceId: string): Promise<number> {
    // TODO: Integrate with usage tracking module when cost data is available
    // This should aggregate costs from ApiUsage entity for the current billing period
    return 0.0;
  }
}
