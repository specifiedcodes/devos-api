import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Story, StoryStatus, StoryPriority } from '../../../database/entities/story.entity';
import { Sprint, SprintStatus } from '../../../database/entities/sprint.entity';
import { Agent, AgentType, AgentStatus } from '../../../database/entities/agent.entity';

// ============================================================================
// Response Type Interfaces (matching frontend types/analytics.ts exactly)
// ============================================================================

export interface VelocityDataPoint {
  sprintNumber: number;
  sprintName: string;
  points: number;
  isCurrentSprint: boolean;
}

export interface VelocityData {
  dataPoints: VelocityDataPoint[];
  averageVelocity: number;
  totalSprints: number;
}

export interface BurndownDataPoint {
  date: string;
  remainingPoints: number;
  idealPoints: number;
  dayNumber: number;
}

export interface BurndownData {
  dataPoints: BurndownDataPoint[];
  sprintId: string;
  sprintName: string;
  totalPoints: number;
  remainingPoints: number;
  completedPoints: number;
  remainingDays: number;
  totalDays: number;
  status: 'ahead' | 'on-track' | 'behind';
}

export interface ThroughputDataPoint {
  weekStartDate: string;
  storiesCompleted: number;
}

export interface ThroughputData {
  dataPoints: ThroughputDataPoint[];
  averageThroughput: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  trendPercentage: number;
}

export interface CycleTimeByPriority {
  priority: string;
  averageDays: number;
  averageHours: number;
  count: number;
}

export interface CycleTimeDistribution {
  range: string;
  count: number;
}

export interface CycleTimeData {
  overallAverageDays: number;
  overallAverageHours: number;
  byPriority: CycleTimeByPriority[];
  distribution: CycleTimeDistribution[];
  totalStories: number;
}

export interface LeadTimeTrend {
  sprintNumber: number;
  sprintName: string;
  averageDays: number;
}

export interface LeadTimeData {
  overallAverageDays: number;
  overallAverageHours: number;
  cycleTimeComparison: {
    leadTime: number;
    cycleTime: number;
    waitTime: number;
  };
  trend: LeadTimeTrend[];
}

export interface AgentUtilizationEntry {
  agentType: string;
  utilizationPercentage: number;
  activeHours: number;
  totalAvailableHours: number;
}

export interface AgentUtilizationData {
  entries: AgentUtilizationEntry[];
  totalActiveHours: number;
  averageUtilization: number;
}

export interface CumulativeFlowDataPoint {
  date: string;
  backlog: number;
  in_progress: number;
  review: number;
  done: number;
}

export interface CumulativeFlowData {
  dataPoints: CumulativeFlowDataPoint[];
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface HeatmapCell {
  agentType: string;
  dayOfWeek: DayOfWeek;
  hours: number;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  maxHours: number;
  agentSummary: Record<string, number>;
}

// ============================================================================
// Service Implementation
// ============================================================================

@Injectable()
export class ProjectAnalyticsService {
  private readonly logger = new Logger(ProjectAnalyticsService.name);

  constructor(
    @InjectRepository(Story)
    private readonly storyRepository: Repository<Story>,
    @InjectRepository(Sprint)
    private readonly sprintRepository: Repository<Sprint>,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {}

  /**
   * Get velocity data: story points completed per sprint
   */
  async getVelocityData(projectId: string, sprintCount: number): Promise<VelocityData> {
    const sprints = await this.sprintRepository.find({
      where: { projectId },
      order: { sprintNumber: 'DESC' },
      take: sprintCount,
    });

    if (sprints.length === 0) {
      return { dataPoints: [], averageVelocity: 0, totalSprints: 0 };
    }

    // Reverse to get ascending order for display
    const orderedSprints = [...sprints].reverse();
    const activeSprint = orderedSprints.find(s => s.status === SprintStatus.ACTIVE);

    // Single batch query for all sprint points (avoids N+1)
    const sprintIds = orderedSprints.map(s => s.id);
    const pointsResults = await this.storyRepository
      .createQueryBuilder('story')
      .select('story.sprint_id', 'sprintId')
      .addSelect('COALESCE(SUM(story.story_points), 0)', 'total')
      .where('story.project_id = :projectId', { projectId })
      .andWhere('story.sprint_id IN (:...sprintIds)', { sprintIds })
      .andWhere('story.status = :status', { status: StoryStatus.DONE })
      .groupBy('story.sprint_id')
      .getRawMany();

    const pointsBySprintId = new Map<string, number>();
    for (const row of pointsResults) {
      pointsBySprintId.set(row.sprintId, parseInt(row.total ?? '0', 10) || 0);
    }

    const dataPoints: VelocityDataPoint[] = [];
    let totalPoints = 0;

    for (const sprint of orderedSprints) {
      const points = pointsBySprintId.get(sprint.id) || 0;
      totalPoints += points;

      dataPoints.push({
        sprintNumber: sprint.sprintNumber,
        sprintName: sprint.name,
        points,
        isCurrentSprint: activeSprint ? sprint.id === activeSprint.id : false,
      });
    }

    const averageVelocity = dataPoints.length > 0
      ? Math.round((totalPoints / dataPoints.length) * 100) / 100
      : 0;

    return {
      dataPoints,
      averageVelocity,
      totalSprints: dataPoints.length,
    };
  }

  /**
   * Get burndown data for a specific sprint
   */
  async getBurndownData(projectId: string, sprintId: string): Promise<BurndownData> {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });

    if (!sprint) {
      throw new NotFoundException(`Sprint ${sprintId} not found in project ${projectId}`);
    }

    if (!sprint.startDate || !sprint.endDate) {
      throw new BadRequestException(`Sprint ${sprintId} does not have start/end dates`);
    }

    const stories = await this.storyRepository.find({
      where: { projectId, sprintId },
    });

    const totalPoints = stories.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    const dataPoints: BurndownDataPoint[] = [];
    let lastRemainingPoints = totalPoints;

    for (let dayNumber = 0; dayNumber <= totalDays; dayNumber++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + dayNumber);
      const dateStr = currentDate.toISOString().split('T')[0];

      const idealPoints = totalDays > 0
        ? Math.round((totalPoints * (1 - dayNumber / totalDays)) * 100) / 100
        : 0;

      // Only calculate actual for dates up to today
      if (currentDate <= today) {
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        const completedByDate = stories.filter(s => {
          if (s.status !== StoryStatus.DONE) return false;
          return s.updatedAt <= endOfDay;
        });

        const completedPoints = completedByDate.reduce((sum, s) => sum + (s.storyPoints || 0), 0);
        lastRemainingPoints = totalPoints - completedPoints;
      }

      dataPoints.push({
        date: dateStr,
        remainingPoints: lastRemainingPoints,
        idealPoints,
        dayNumber,
      });
    }

    const completedPoints = totalPoints - lastRemainingPoints;
    const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine status based on latest data point comparison
    let status: 'ahead' | 'on-track' | 'behind';
    const currentDayNumber = Math.min(
      Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      totalDays,
    );
    const currentIdeal = totalDays > 0
      ? totalPoints * (1 - currentDayNumber / totalDays)
      : 0;
    const tolerance = totalPoints * 0.1; // 10% tolerance

    if (lastRemainingPoints < currentIdeal - tolerance) {
      status = 'ahead';
    } else if (lastRemainingPoints > currentIdeal + tolerance) {
      status = 'behind';
    } else {
      status = 'on-track';
    }

    return {
      dataPoints,
      sprintId,
      sprintName: sprint.name,
      totalPoints,
      remainingPoints: lastRemainingPoints,
      completedPoints,
      remainingDays,
      totalDays,
      status,
    };
  }

  /**
   * Get throughput data: stories completed per week
   */
  async getThroughputData(projectId: string, startDate: Date, endDate: Date): Promise<ThroughputData> {
    const completedStories = await this.storyRepository
      .createQueryBuilder('story')
      .where('story.project_id = :projectId', { projectId })
      .andWhere('story.status = :status', { status: StoryStatus.DONE })
      .andWhere('story.updated_at >= :startDate', { startDate })
      .andWhere('story.updated_at <= :endDate', { endDate })
      .getMany();

    // Group by week
    const weekMap = new Map<string, number>();
    const currentDate = new Date(startDate);
    // Align to Monday
    const dayOfWeek = currentDate.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentDate.setDate(currentDate.getDate() + diff);

    while (currentDate <= endDate) {
      const weekKey = currentDate.toISOString().split('T')[0];
      weekMap.set(weekKey, 0);
      currentDate.setDate(currentDate.getDate() + 7);
    }

    for (const story of completedStories) {
      const storyDate = new Date(story.updatedAt);
      const storyDay = storyDate.getDay();
      const storyDiff = storyDay === 0 ? -6 : 1 - storyDay;
      const weekStart = new Date(storyDate);
      weekStart.setDate(weekStart.getDate() + storyDiff);
      const weekKey = weekStart.toISOString().split('T')[0];

      if (weekMap.has(weekKey)) {
        weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
      } else {
        weekMap.set(weekKey, 1);
      }
    }

    const dataPoints: ThroughputDataPoint[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStartDate, storiesCompleted]) => ({ weekStartDate, storiesCompleted }));

    const totalCompleted = dataPoints.reduce((sum, dp) => sum + dp.storiesCompleted, 0);
    const averageThroughput = dataPoints.length > 0
      ? Math.round((totalCompleted / dataPoints.length) * 100) / 100
      : 0;

    // Calculate trend
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    let trendPercentage = 0;

    if (dataPoints.length >= 2) {
      const midpoint = Math.floor(dataPoints.length / 2);
      const firstHalf = dataPoints.slice(0, midpoint);
      const secondHalf = dataPoints.slice(midpoint);

      const firstAvg = firstHalf.reduce((s, d) => s + d.storiesCompleted, 0) / (firstHalf.length || 1);
      const secondAvg = secondHalf.reduce((s, d) => s + d.storiesCompleted, 0) / (secondHalf.length || 1);

      if (firstAvg === 0) {
        trendPercentage = secondAvg > 0 ? 100 : 0;
      } else {
        trendPercentage = Math.round(((secondAvg - firstAvg) / firstAvg) * 100 * 100) / 100;
      }

      if (trendPercentage > 5) {
        trend = 'increasing';
      } else if (trendPercentage < -5) {
        trend = 'decreasing';
      } else {
        trend = 'stable';
      }
    }

    return { dataPoints, averageThroughput, trend, trendPercentage };
  }

  /**
   * Get cycle time data: time from in_progress to done
   */
  async getCycleTimeData(projectId: string, startDate: Date, endDate: Date): Promise<CycleTimeData> {
    const completedStories = await this.storyRepository.find({
      where: { projectId, status: StoryStatus.DONE },
    });

    // Filter to stories completed within range
    const storiesInRange = completedStories.filter(s => {
      const updatedAt = new Date(s.updatedAt);
      return updatedAt >= startDate && updatedAt <= endDate;
    });

    if (storiesInRange.length === 0) {
      return {
        overallAverageDays: 0,
        overallAverageHours: 0,
        byPriority: [],
        distribution: this.getEmptyDistribution(),
        totalStories: 0,
      };
    }

    // Calculate cycle times (approximated as createdAt to updatedAt for done stories)
    const cycleTimes = storiesInRange.map(s => {
      const created = new Date(s.createdAt).getTime();
      const completed = new Date(s.updatedAt).getTime();
      const durationMs = Math.max(0, completed - created);
      return {
        story: s,
        durationMs,
        durationDays: durationMs / (1000 * 60 * 60 * 24),
        durationHours: durationMs / (1000 * 60 * 60),
      };
    });

    const totalDays = cycleTimes.reduce((sum, ct) => sum + ct.durationDays, 0);
    const overallAverageDays = Math.round((totalDays / cycleTimes.length) * 100) / 100;
    const overallAverageHours = Math.round(overallAverageDays * 24 * 100) / 100;

    // Group by priority
    const priorityMap = new Map<string, { totalDays: number; totalHours: number; count: number }>();
    for (const ct of cycleTimes) {
      const priority = ct.story.priority || StoryPriority.MEDIUM;
      const existing = priorityMap.get(priority) || { totalDays: 0, totalHours: 0, count: 0 };
      existing.totalDays += ct.durationDays;
      existing.totalHours += ct.durationHours;
      existing.count += 1;
      priorityMap.set(priority, existing);
    }

    const byPriority: CycleTimeByPriority[] = Array.from(priorityMap.entries()).map(
      ([priority, data]) => ({
        priority,
        averageDays: data.count > 0 ? Math.round((data.totalDays / data.count) * 100) / 100 : 0,
        averageHours: data.count > 0 ? Math.round((data.totalHours / data.count) * 100) / 100 : 0,
        count: data.count,
      }),
    );

    // Distribution ranges
    const ranges = [
      { range: '0-1 days', min: 0, max: 1 },
      { range: '1-2 days', min: 1, max: 2 },
      { range: '2-5 days', min: 2, max: 5 },
      { range: '5-10 days', min: 5, max: 10 },
      { range: '10+ days', min: 10, max: Infinity },
    ];

    const distribution: CycleTimeDistribution[] = ranges.map(r => ({
      range: r.range,
      count: cycleTimes.filter(ct => ct.durationDays >= r.min && ct.durationDays < r.max).length,
    }));

    return {
      overallAverageDays,
      overallAverageHours,
      byPriority,
      distribution,
      totalStories: storiesInRange.length,
    };
  }

  /**
   * Get lead time data: time from creation to done
   */
  async getLeadTimeData(projectId: string, startDate: Date, endDate: Date): Promise<LeadTimeData> {
    const completedStories = await this.storyRepository.find({
      where: { projectId, status: StoryStatus.DONE },
    });

    const storiesInRange = completedStories.filter(s => {
      const updatedAt = new Date(s.updatedAt);
      return updatedAt >= startDate && updatedAt <= endDate;
    });

    if (storiesInRange.length === 0) {
      return {
        overallAverageDays: 0,
        overallAverageHours: 0,
        cycleTimeComparison: { leadTime: 0, cycleTime: 0, waitTime: 0 },
        trend: [],
      };
    }

    // Lead time = createdAt to updatedAt (where updatedAt is when it became done)
    const leadTimes = storiesInRange.map(s => {
      const created = new Date(s.createdAt).getTime();
      const completed = new Date(s.updatedAt).getTime();
      const durationMs = Math.max(0, completed - created);
      return {
        story: s,
        durationDays: durationMs / (1000 * 60 * 60 * 24),
      };
    });

    const totalDays = leadTimes.reduce((sum, lt) => sum + lt.durationDays, 0);
    const overallAverageDays = Math.round((totalDays / leadTimes.length) * 100) / 100;
    const overallAverageHours = Math.round(overallAverageDays * 24 * 100) / 100;

    // Cycle time approximation (same as lead time since we don't track in_progress start separately)
    // Use 70% of lead time as a reasonable cycle-time approximation
    const cycleTime = Math.round(overallAverageDays * 0.7 * 100) / 100;
    const waitTime = Math.round((overallAverageDays - cycleTime) * 100) / 100;

    // Trend by sprint
    const sprintIds = [...new Set(storiesInRange.filter(s => s.sprintId).map(s => s.sprintId!))];
    const sprints = sprintIds.length > 0
      ? await this.sprintRepository
          .createQueryBuilder('sprint')
          .where('sprint.id IN (:...ids)', { ids: sprintIds })
          .orderBy('sprint.sprint_number', 'ASC')
          .getMany()
      : [];

    const trend: LeadTimeTrend[] = sprints.map(sprint => {
      const sprintStories = leadTimes.filter(lt => lt.story.sprintId === sprint.id);
      const avgDays = sprintStories.length > 0
        ? Math.round((sprintStories.reduce((s, lt) => s + lt.durationDays, 0) / sprintStories.length) * 100) / 100
        : 0;
      return {
        sprintNumber: sprint.sprintNumber,
        sprintName: sprint.name,
        averageDays: avgDays,
      };
    });

    return {
      overallAverageDays,
      overallAverageHours,
      cycleTimeComparison: {
        leadTime: overallAverageDays,
        cycleTime,
        waitTime,
      },
      trend,
    };
  }

  /**
   * Get agent utilization data
   */
  async getAgentUtilizationData(projectId: string, startDate: Date, endDate: Date): Promise<AgentUtilizationData> {
    const agents = await this.agentRepository.find({
      where: { projectId },
    });

    if (agents.length === 0) {
      return { entries: [], totalActiveHours: 0, averageUtilization: 0 };
    }

    const totalRangeHours = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));

    // Group by agent type
    const typeMap = new Map<string, { activeHours: number; count: number }>();

    for (const agent of agents) {
      const agentType = agent.type;
      let activeMs = 0;

      if (agent.startedAt && (agent.completedAt || agent.status === AgentStatus.RUNNING)) {
        const start = Math.max(new Date(agent.startedAt).getTime(), startDate.getTime());
        const end = agent.completedAt
          ? Math.min(new Date(agent.completedAt).getTime(), endDate.getTime())
          : Math.min(Date.now(), endDate.getTime());
        activeMs = Math.max(0, end - start);
      }

      const activeHours = activeMs / (1000 * 60 * 60);
      const existing = typeMap.get(agentType) || { activeHours: 0, count: 0 };
      existing.activeHours += activeHours;
      existing.count += 1;
      typeMap.set(agentType, existing);
    }

    const entries: AgentUtilizationEntry[] = Array.from(typeMap.entries()).map(
      ([agentType, data]) => {
        const totalAvailableHours = totalRangeHours * data.count;
        const utilizationPercentage = totalAvailableHours > 0
          ? Math.round((data.activeHours / totalAvailableHours) * 100 * 100) / 100
          : 0;
        return {
          agentType,
          utilizationPercentage: Math.min(100, utilizationPercentage),
          activeHours: Math.round(data.activeHours * 100) / 100,
          totalAvailableHours: Math.round(totalAvailableHours * 100) / 100,
        };
      },
    );

    const totalActiveHours = entries.reduce((sum, e) => sum + e.activeHours, 0);
    const averageUtilization = entries.length > 0
      ? Math.round((entries.reduce((sum, e) => sum + e.utilizationPercentage, 0) / entries.length) * 100) / 100
      : 0;

    return {
      entries,
      totalActiveHours: Math.round(totalActiveHours * 100) / 100,
      averageUtilization,
    };
  }

  /**
   * Get cumulative flow data: daily story status snapshots
   */
  async getCumulativeFlowData(projectId: string, startDate: Date, endDate: Date): Promise<CumulativeFlowData> {
    const stories = await this.storyRepository.find({
      where: { projectId },
    });

    const dataPoints: CumulativeFlowDataPoint[] = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Count stories by status as of this date
      let backlog = 0;
      let inProgress = 0;
      let review = 0;
      let done = 0;

      for (const story of stories) {
        // Only count stories that existed by this date
        if (new Date(story.createdAt) > endOfDay) continue;

        // Determine status as of this date
        if (story.status === StoryStatus.DONE && new Date(story.updatedAt) <= endOfDay) {
          done++;
        } else if (story.status === StoryStatus.REVIEW && new Date(story.updatedAt) <= endOfDay) {
          review++;
        } else if (story.status === StoryStatus.IN_PROGRESS && new Date(story.updatedAt) <= endOfDay) {
          inProgress++;
        } else {
          backlog++;
        }
      }

      dataPoints.push({
        date: dateStr,
        backlog,
        in_progress: inProgress,
        review,
        done,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      dataPoints,
      dateRange: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
    };
  }

  /**
   * Get agent activity heatmap data
   */
  async getAgentHeatmapData(projectId: string, startDate: Date, endDate: Date): Promise<HeatmapData> {
    const agents = await this.agentRepository.find({
      where: { projectId },
    });

    const dayNames: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const agentTypes = Object.values(AgentType);

    // Initialize cells
    const cellMap = new Map<string, number>();
    for (const agentType of agentTypes) {
      for (const day of dayNames) {
        cellMap.set(`${agentType}-${day}`, 0);
      }
    }

    // Calculate hours per day-of-week for each agent
    for (const agent of agents) {
      if (!agent.completedAt && agent.status !== AgentStatus.RUNNING) continue;

      const agentStart = agent.startedAt ? new Date(agent.startedAt) : null;
      const agentEnd = agent.completedAt ? new Date(agent.completedAt) : new Date();

      if (!agentStart) continue;
      if (agentStart > endDate || agentEnd < startDate) continue;

      const effectiveStart = new Date(Math.max(agentStart.getTime(), startDate.getTime()));
      const effectiveEnd = new Date(Math.min(agentEnd.getTime(), endDate.getTime()));

      // Distribute hours across days
      const current = new Date(effectiveStart);
      while (current < effectiveEnd) {
        const dayEnd = new Date(current);
        dayEnd.setHours(23, 59, 59, 999);
        const segmentEnd = new Date(Math.min(dayEnd.getTime(), effectiveEnd.getTime()));
        const hoursInDay = (segmentEnd.getTime() - current.getTime()) / (1000 * 60 * 60);

        const dayOfWeek = dayNames[current.getDay()];
        const key = `${agent.type}-${dayOfWeek}`;
        cellMap.set(key, (cellMap.get(key) || 0) + hoursInDay);

        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    }

    const cells: HeatmapCell[] = [];
    let maxHours = 0;

    for (const [key, hours] of cellMap.entries()) {
      const [agentType, dayOfWeek] = key.split('-') as [string, DayOfWeek];
      const roundedHours = Math.round(hours * 100) / 100;
      cells.push({ agentType, dayOfWeek, hours: roundedHours });
      if (roundedHours > maxHours) maxHours = roundedHours;
    }

    // Agent summary (total hours per agent type)
    const agentSummary: Record<string, number> = {};
    for (const agentType of agentTypes) {
      const total = cells
        .filter(c => c.agentType === agentType)
        .reduce((sum, c) => sum + c.hours, 0);
      agentSummary[agentType] = Math.round(total * 100) / 100;
    }

    return {
      cells,
      maxHours: Math.round(maxHours * 100) / 100,
      agentSummary,
    };
  }

  /**
   * Helper: empty distribution ranges
   */
  private getEmptyDistribution(): CycleTimeDistribution[] {
    return [
      { range: '0-1 days', count: 0 },
      { range: '1-2 days', count: 0 },
      { range: '2-5 days', count: 0 },
      { range: '5-10 days', count: 0 },
      { range: '10+ days', count: 0 },
    ];
  }
}
