import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledReport, ReportFrequency } from '../../../database/entities/scheduled-report.entity';
import {
  CreateScheduledReportDto,
  UpdateScheduledReportDto,
  ScheduledReportResponseDto,
} from '../dto/scheduled-report.dto';

@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    @InjectRepository(ScheduledReport)
    private readonly scheduledReportRepository: Repository<ScheduledReport>,
  ) {}

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateScheduledReportDto,
  ): Promise<ScheduledReportResponseDto> {
    this.logger.log(`Creating scheduled report "${dto.name}" for workspace ${workspaceId}`);

    const report = this.scheduledReportRepository.create({
      workspaceId,
      createdBy: userId,
      name: dto.name,
      frequency: dto.frequency,
      dayOfWeek: dto.dayOfWeek,
      dayOfMonth: dto.dayOfMonth,
      timeUtc: dto.timeUtc || '09:00',
      sections: dto.sections,
      filters: dto.filters || {},
      recipients: dto.recipients,
      isActive: true,
    });

    await this.scheduledReportRepository.save(report);

    return this.toResponseDto(report);
  }

  async findAll(workspaceId: string): Promise<ScheduledReportResponseDto[]> {
    const reports = await this.scheduledReportRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });

    return reports.map(r => this.toResponseDto(r));
  }

  async findOne(workspaceId: string, id: string): Promise<ScheduledReportResponseDto> {
    const report = await this.scheduledReportRepository.findOne({
      where: { id, workspaceId },
    });

    if (!report) {
      throw new NotFoundException('Scheduled report not found');
    }

    return this.toResponseDto(report);
  }

  async update(
    workspaceId: string,
    id: string,
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReportResponseDto> {
    const report = await this.scheduledReportRepository.findOne({
      where: { id, workspaceId },
    });

    if (!report) {
      throw new NotFoundException('Scheduled report not found');
    }

    if (dto.name !== undefined) report.name = dto.name;
    if (dto.frequency !== undefined) report.frequency = dto.frequency;
    if (dto.dayOfWeek !== undefined) report.dayOfWeek = dto.dayOfWeek;
    if (dto.dayOfMonth !== undefined) report.dayOfMonth = dto.dayOfMonth;
    if (dto.timeUtc !== undefined) report.timeUtc = dto.timeUtc;
    if (dto.sections !== undefined) report.sections = dto.sections;
    if (dto.filters !== undefined) report.filters = dto.filters;
    if (dto.recipients !== undefined) report.recipients = dto.recipients;
    if (dto.isActive !== undefined) report.isActive = dto.isActive;

    await this.scheduledReportRepository.save(report);

    return this.toResponseDto(report);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const report = await this.scheduledReportRepository.findOne({
      where: { id, workspaceId },
    });

    if (!report) {
      throw new NotFoundException('Scheduled report not found');
    }

    await this.scheduledReportRepository.remove(report);
  }

  async findDueReports(frequency: ReportFrequency): Promise<ScheduledReport[]> {
    const now = new Date();
    const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const currentDayOfWeek = now.getUTCDay();
    const currentDayOfMonth = now.getUTCDate();

    const queryBuilder = this.scheduledReportRepository
      .createQueryBuilder('report')
      .where('report.isActive = :isActive', { isActive: true })
      .andWhere('report.frequency = :frequency', { frequency })
      .andWhere('report.timeUtc = :currentTime', { currentTime });

    if (frequency === ReportFrequency.WEEKLY) {
      queryBuilder.andWhere('report.dayOfWeek = :currentDayOfWeek', { currentDayOfWeek });
    } else if (frequency === ReportFrequency.MONTHLY) {
      queryBuilder.andWhere('report.dayOfMonth = :currentDayOfMonth', { currentDayOfMonth });
    }

    const reports = await queryBuilder.getMany();

    return reports.filter(report => {
      if (!report.lastSentAt) return true;
      const lastSent = new Date(report.lastSentAt);
      const hoursSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
      return hoursSinceLastSent >= 23;
    });
  }

  async markAsSent(id: string): Promise<boolean> {
    const now = new Date();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    
    const result = await this.scheduledReportRepository
      .createQueryBuilder()
      .update(ScheduledReport)
      .set({ lastSentAt: now })
      .where('id = :id', { id })
      .andWhere('(lastSentAt IS NULL OR lastSentAt < :twentyThreeHoursAgo)', { twentyThreeHoursAgo })
      .execute();
    
    return (result.affected ?? 0) > 0;
  }

  private toResponseDto(report: ScheduledReport): ScheduledReportResponseDto {
    return {
      id: report.id,
      workspaceId: report.workspaceId,
      name: report.name,
      frequency: report.frequency,
      dayOfWeek: report.dayOfWeek,
      dayOfMonth: report.dayOfMonth,
      timeUtc: report.timeUtc,
      sections: report.sections,
      filters: report.filters,
      recipients: report.recipients,
      isActive: report.isActive,
      lastSentAt: report.lastSentAt,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }
}
