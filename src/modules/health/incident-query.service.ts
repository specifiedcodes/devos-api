import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../../database/entities/incident.entity';

/**
 * IncidentQueryService
 * Story 14.9: Incident Management (AC11)
 *
 * Read-only service for querying incident data in the HealthModule.
 * Used by public status endpoints to avoid duplicating query logic
 * from the admin IncidentService.
 */
@Injectable()
export class IncidentQueryService {
  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
  ) {}

  /**
   * Get all active (non-resolved) incidents ordered by severity then createdAt.
   */
  async getActiveIncidents(): Promise<Incident[]> {
    const incidents = await this.incidentRepository.find({
      where: [
        { status: 'investigating' as const },
        { status: 'identified' as const },
        { status: 'monitoring' as const },
      ],
      relations: ['updates'],
      order: { createdAt: 'DESC' },
    });

    // Sort by severity (critical first), then by createdAt DESC
    const severityOrder: Record<string, number> = {
      critical: 0,
      major: 1,
      minor: 2,
    };

    incidents.sort((a, b) => {
      const severityDiff =
        (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return incidents;
  }

  /**
   * Get recently resolved incidents (within last 24 hours).
   */
  async getRecentlyResolvedIncidents(): Promise<Incident[]> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    return this.incidentRepository
      .createQueryBuilder('incident')
      .leftJoinAndSelect('incident.updates', 'updates')
      .where('incident.status = :status', { status: 'resolved' })
      .andWhere('incident.resolvedAt >= :since', {
        since: twentyFourHoursAgo,
      })
      .orderBy('incident.resolvedAt', 'DESC')
      .getMany();
  }

  /**
   * Derive overall platform status from active incidents.
   */
  derivePlatformStatus(
    activeIncidents: Incident[],
  ): 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' {
    if (activeIncidents.some((i) => i.severity === 'critical')) {
      return 'major_outage';
    }
    if (activeIncidents.some((i) => i.severity === 'major')) {
      return 'partial_outage';
    }
    if (activeIncidents.some((i) => i.severity === 'minor')) {
      return 'degraded_performance';
    }
    return 'operational';
  }
}
