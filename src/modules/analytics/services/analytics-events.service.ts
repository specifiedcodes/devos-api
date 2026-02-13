import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

@Injectable()
export class AnalyticsEventsService {
  private readonly logger = new Logger(AnalyticsEventsService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventsRepository: Repository<AnalyticsEvent>,
  ) {}

  /**
   * Log an analytics event with fire-and-forget pattern
   * Errors are logged but do not throw to avoid blocking main operations
   * Returns the event ID if successful, null if duplicate or error
   */
  async logEvent(
    userId: string,
    workspaceId: string,
    eventType: string,
    eventData: Record<string, any>,
    sessionId?: string,
  ): Promise<string | null> {
    const timestamp = new Date(); // Use consistent timestamp for deduplication and event

    try {
      // Check for duplicate event (within 1 second)
      const isDuplicate = await this.deduplicateEvent(userId, eventType, timestamp);
      if (isDuplicate) {
        this.logger.debug(`Duplicate event detected: ${eventType} for user ${userId}`);
        return null; // Return null for duplicates
      }

      const event = this.eventsRepository.create({
        userId,
        workspaceId,
        eventType,
        eventData,
        sessionId,
        timestamp,
      });

      const saved = await this.eventsRepository.save(event);
      this.logger.log(`Event logged: ${eventType} for user ${userId}`);
      return saved.id; // Return actual event ID
    } catch (error) {
      this.logger.error(
        `Failed to log event: ${eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
      // Fire-and-forget: Return null on error to avoid blocking main operations
      return null;
    }
  }

  /**
   * Check for duplicate events within 1 second window
   */
  private async deduplicateEvent(
    userId: string,
    eventType: string,
    timestamp: Date,
  ): Promise<boolean> {
    const oneSecondAgo = new Date(timestamp.getTime() - 1000);
    const oneSecondLater = new Date(timestamp.getTime() + 1000);

    const existingEvent = await this.eventsRepository.findOne({
      where: {
        userId,
        eventType,
        timestamp: Between(oneSecondAgo, oneSecondLater),
      },
    });

    return !!existingEvent;
  }

  /**
   * Get all events for a specific user, ordered by timestamp
   */
  async getEventsByUser(userId: string): Promise<AnalyticsEvent[]> {
    return this.eventsRepository.find({
      where: { userId },
      order: { timestamp: 'ASC' },
    });
  }

  /**
   * Get events by type in a date range, optionally filtered by workspace
   */
  async getEventsByType(
    eventType: string,
    startDate: Date,
    endDate: Date,
    workspaceId?: string,
  ): Promise<AnalyticsEvent[]> {
    const query = this.eventsRepository
      .createQueryBuilder('event')
      .where('event.eventType = :eventType', { eventType })
      .andWhere('event.timestamp >= :startDate', { startDate })
      .andWhere('event.timestamp <= :endDate', { endDate });

    if (workspaceId) {
      query.andWhere('event.workspaceId = :workspaceId', { workspaceId });
    }

    return query.getMany();
  }
}
