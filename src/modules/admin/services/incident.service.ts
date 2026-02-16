import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Incident } from '../../../database/entities/incident.entity';
import { IncidentUpdate } from '../../../database/entities/incident-update.entity';
import { AlertHistory } from '../../../database/entities/alert-history.entity';
import {
  CreateIncidentDto,
  AddIncidentUpdateDto,
  ResolveIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
} from '../dto/incident.dto';

/**
 * IncidentService
 * Story 14.9: Incident Management (AC3)
 *
 * Manages the full incident lifecycle: creation, updates, resolution,
 * and notification dispatch via events.
 */
@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    @InjectRepository(Incident)
    private readonly incidentRepository: Repository<Incident>,
    @InjectRepository(IncidentUpdate)
    private readonly incidentUpdateRepository: Repository<IncidentUpdate>,
    @InjectRepository(AlertHistory)
    private readonly alertHistoryRepository: Repository<AlertHistory>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new incident with initial timeline entry.
   */
  async createIncident(
    dto: CreateIncidentDto,
    adminId: string,
  ): Promise<Incident> {
    // Validate alertHistoryId if provided
    if (dto.alertHistoryId) {
      const alertHistory = await this.alertHistoryRepository.findOne({
        where: { id: dto.alertHistoryId },
      });
      if (!alertHistory) {
        throw new NotFoundException(
          `AlertHistory with id "${dto.alertHistoryId}" not found`,
        );
      }
    }

    // Create incident record
    const incident = this.incidentRepository.create({
      title: dto.title,
      description: dto.description,
      severity: dto.severity,
      status: 'investigating',
      affectedServices: dto.affectedServices,
      alertHistoryId: dto.alertHistoryId || null,
      createdBy: adminId,
    });

    const savedIncident = await this.incidentRepository.save(incident);

    // Create initial timeline entry
    const initialUpdate = this.incidentUpdateRepository.create({
      incidentId: savedIncident.id,
      message: dto.description,
      status: 'investigating',
      author: adminId,
    });

    await this.incidentUpdateRepository.save(initialUpdate);

    this.logger.log(
      `Incident created: "${savedIncident.title}" (${savedIncident.severity}) by ${adminId}`,
    );

    // Emit event
    this.eventEmitter.emit('incident.created', {
      incident: savedIncident,
      update: initialUpdate,
    });

    // Return incident with the initial update
    savedIncident.updates = [initialUpdate];
    return savedIncident;
  }

  /**
   * Add a timeline update to an existing incident.
   */
  async addUpdate(
    incidentId: string,
    dto: AddIncidentUpdateDto,
    adminId: string,
  ): Promise<IncidentUpdate> {
    const incident = await this.incidentRepository.findOne({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundException(`Incident "${incidentId}" not found`);
    }

    if (incident.status === 'resolved') {
      throw new BadRequestException(
        'Cannot add update to a resolved incident',
      );
    }

    // Create the update record
    const update = this.incidentUpdateRepository.create({
      incidentId,
      message: dto.message,
      status: dto.status,
      author: adminId,
    });

    const savedUpdate = await this.incidentUpdateRepository.save(update);

    // Update parent incident status if changed
    if (incident.status !== dto.status) {
      incident.status = dto.status;
      await this.incidentRepository.save(incident);
    }

    this.logger.log(
      `Incident update added: "${incident.title}" -> ${dto.status} by ${adminId}`,
    );

    // Emit event
    this.eventEmitter.emit('incident.updated', {
      incident,
      update: savedUpdate,
    });

    return savedUpdate;
  }

  /**
   * Resolve an incident with optional message and post-mortem URL.
   */
  async resolveIncident(
    incidentId: string,
    dto: ResolveIncidentDto,
    adminId: string,
  ): Promise<Incident> {
    const incident = await this.incidentRepository.findOne({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundException(`Incident "${incidentId}" not found`);
    }

    if (incident.status === 'resolved') {
      throw new BadRequestException('Incident is already resolved');
    }

    // Set resolved status
    incident.status = 'resolved';
    incident.resolvedAt = new Date();

    if (dto.postMortemUrl) {
      incident.postMortemUrl = dto.postMortemUrl;
    }

    await this.incidentRepository.save(incident);

    // Create final resolved update
    const resolveMessage =
      dto.message || `Incident resolved by ${adminId}`;
    const finalUpdate = this.incidentUpdateRepository.create({
      incidentId,
      message: resolveMessage,
      status: 'resolved',
      author: adminId,
    });

    await this.incidentUpdateRepository.save(finalUpdate);

    this.logger.log(
      `Incident resolved: "${incident.title}" by ${adminId}`,
    );

    // Emit event
    this.eventEmitter.emit('incident.resolved', {
      incident,
      update: finalUpdate,
    });

    return incident;
  }

  /**
   * Get a single incident with all timeline updates.
   */
  async getIncident(incidentId: string): Promise<Incident> {
    const incident = await this.incidentRepository.findOne({
      where: { id: incidentId },
      relations: ['updates'],
    });

    if (!incident) {
      throw new NotFoundException(`Incident "${incidentId}" not found`);
    }

    // Order updates by createdAt ASC
    if (incident.updates) {
      incident.updates.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }

    return incident;
  }

  /**
   * List incidents with pagination and optional filters.
   */
  async listIncidents(
    query: IncidentQueryDto,
  ): Promise<{ items: Incident[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.incidentRepository.createQueryBuilder('incident');

    if (query.status) {
      qb.andWhere('incident.status = :status', { status: query.status });
    }

    if (query.severity) {
      qb.andWhere('incident.severity = :severity', {
        severity: query.severity,
      });
    }

    if (query.startDate) {
      qb.andWhere('incident.createdAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      qb.andWhere('incident.createdAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    const [items, total] = await qb
      .orderBy('incident.createdAt', 'DESC')
      .take(limit)
      .skip(skip)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * Get all active (non-resolved) incidents.
   * Used by the public status API.
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
   * Update incident metadata (title, description, severity, affectedServices, postMortemUrl).
   * Does NOT change status (use addUpdate for status changes).
   */
  async updateIncident(
    incidentId: string,
    dto: UpdateIncidentDto,
    adminId: string,
  ): Promise<Incident> {
    const incident = await this.incidentRepository.findOne({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundException(`Incident "${incidentId}" not found`);
    }

    // For resolved incidents, only allow postMortemUrl update
    if (incident.status === 'resolved') {
      if (dto.postMortemUrl !== undefined) {
        incident.postMortemUrl = dto.postMortemUrl;
        await this.incidentRepository.save(incident);
        return incident;
      }
      throw new BadRequestException(
        'Cannot update resolved incident (except postMortemUrl)',
      );
    }

    // Apply metadata updates
    if (dto.title !== undefined) incident.title = dto.title;
    if (dto.description !== undefined) incident.description = dto.description;
    if (dto.severity !== undefined) incident.severity = dto.severity;
    if (dto.affectedServices !== undefined)
      incident.affectedServices = dto.affectedServices;
    if (dto.postMortemUrl !== undefined)
      incident.postMortemUrl = dto.postMortemUrl;

    await this.incidentRepository.save(incident);

    this.logger.log(
      `Incident updated: "${incident.title}" by ${adminId}`,
    );

    return incident;
  }

  /**
   * Get recently resolved incidents (within last 24 hours).
   * Used by the public status API.
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
}
