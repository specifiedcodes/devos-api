import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Request,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { IncidentService } from '../services/incident.service';
import { AuditService, AuditAction } from '../../../shared/audit/audit.service';
import {
  CreateIncidentDto,
  AddIncidentUpdateDto,
  ResolveIncidentDto,
  UpdateIncidentDto,
  IncidentQueryDto,
} from '../dto/incident.dto';

/**
 * IncidentController
 * Story 14.9: Incident Management (AC5)
 *
 * Admin API for managing incidents and their timeline updates.
 * All endpoints require @PlatformAdmin() decorator.
 */
@ApiTags('Admin - Incidents')
@ApiBearerAuth('JWT-auth')
@Controller('api/admin/incidents')
export class IncidentController {
  private readonly logger = new Logger(IncidentController.name);

  constructor(
    private readonly incidentService: IncidentService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * POST /api/admin/incidents
   * Create a new incident.
   */
  @Post()
  @PlatformAdmin()
  async createIncident(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: CreateIncidentDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const incident = await this.incidentService.createIncident(dto, adminId);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_INCIDENT_CREATED,
      'incident',
      incident.id,
      {
        title: incident.title,
        severity: incident.severity,
        affectedServices: incident.affectedServices,
      },
      req,
    );

    return incident;
  }

  /**
   * GET /api/admin/incidents/:id
   * Get a single incident with all timeline updates.
   */
  @Get(':id')
  @PlatformAdmin()
  async getIncident(@Param('id') id: string) {
    return this.incidentService.getIncident(id);
  }

  /**
   * GET /api/admin/incidents
   * List incidents with pagination and filters.
   */
  @Get()
  @PlatformAdmin()
  async listIncidents(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: IncidentQueryDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;
    const page = query.page || 1;
    const limit = query.limit || 20;

    const result = await this.incidentService.listIncidents(query);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_INCIDENT_LISTED,
      'incident',
      'list',
      { filters: query },
      req,
    );

    return {
      items: result.items,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    };
  }

  /**
   * PUT /api/admin/incidents/:id
   * Update incident metadata.
   */
  @Put(':id')
  @PlatformAdmin()
  async updateIncident(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: UpdateIncidentDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const incident = await this.incidentService.updateIncident(
      id,
      dto,
      adminId,
    );

    this.logAudit(
      adminId,
      AuditAction.ADMIN_INCIDENT_UPDATED,
      'incident',
      id,
      { changes: Object.keys(dto) },
      req,
    );

    return incident;
  }

  /**
   * POST /api/admin/incidents/:id/updates
   * Add a timeline update to an incident.
   */
  @Post(':id/updates')
  @PlatformAdmin()
  async addUpdate(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: AddIncidentUpdateDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const update = await this.incidentService.addUpdate(id, dto, adminId);

    this.logAudit(
      adminId,
      AuditAction.ADMIN_INCIDENT_UPDATE_ADDED,
      'incident',
      id,
      { updateId: update.id, newStatus: dto.status },
      req,
    );

    return update;
  }

  /**
   * PUT /api/admin/incidents/:id/resolve
   * Resolve an incident.
   */
  @Put(':id/resolve')
  @PlatformAdmin()
  async resolveIncident(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ResolveIncidentDto,
    @Request() req: any,
  ) {
    const adminId = req?.user?.userId || req?.user?.id;

    const incident = await this.incidentService.resolveIncident(
      id,
      dto,
      adminId,
    );

    this.logAudit(
      adminId,
      AuditAction.ADMIN_INCIDENT_RESOLVED,
      'incident',
      id,
      {
        title: incident.title,
        postMortemUrl: incident.postMortemUrl,
      },
      req,
    );

    return incident;
  }

  /**
   * Fire-and-forget audit logging helper.
   */
  private logAudit(
    adminId: string,
    action: AuditAction,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any>,
    req: any,
  ): void {
    this.auditService
      .log('platform', adminId, action, resourceType, resourceId, {
        ...metadata,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
      })
      .catch((err) => {
        void err;
      });
  }
}
