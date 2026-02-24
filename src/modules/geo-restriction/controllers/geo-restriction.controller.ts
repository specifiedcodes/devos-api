import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { SkipGeoCheck } from '../../../common/decorators/skip-geo-check.decorator';
import { SkipIpCheck } from '../../../common/decorators/skip-ip-check.decorator';
import { Permission } from '../../../common/decorators/permission.decorator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { GeoRestrictionService } from '../services/geo-restriction.service';
import { UpdateGeoRestrictionDto } from '../dto/update-geo-restriction.dto';
import {
  GeoRestrictionResponseDto,
  GeoTestResponseDto,
  GeoBlockedAttemptDto,
  GeoIpDatabaseInfoDto,
  CountryInfoDto,
} from '../dto/geo-restriction-response.dto';
import { extractClientIp } from '../../../common/utils/extract-client-ip';

@ApiTags('Geo-Restriction')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/geo-restriction')
@UseGuards(JwtAuthGuard, RoleGuard)
@SkipGeoCheck() // Geo-restriction management endpoints must always be accessible
@SkipIpCheck()  // Also skip IP check for management
export class GeoRestrictionController {
  constructor(private readonly geoRestrictionService: GeoRestrictionService) {}

  // ==================== CONFIG ====================

  @Get()
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Get geo-restriction configuration' })
  @ApiResponse({ status: 200, type: GeoRestrictionResponseDto })
  async getConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<GeoRestrictionResponseDto> {
    return this.geoRestrictionService.getConfig(workspaceId, req.user.id);
  }

  @Put()
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Update geo-restriction configuration' })
  @ApiResponse({ status: 200, type: GeoRestrictionResponseDto })
  async updateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateGeoRestrictionDto,
    @Req() req: any,
  ): Promise<GeoRestrictionResponseDto> {
    return this.geoRestrictionService.updateConfig(workspaceId, req.user.id, dto);
  }

  // ==================== TESTING & MONITORING ====================

  @Post('test')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Test if current location is allowed' })
  @ApiResponse({ status: 200, type: GeoTestResponseDto })
  async testGeo(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<GeoTestResponseDto> {
    const clientIp = extractClientIp(req);
    return this.geoRestrictionService.testGeo(workspaceId, clientIp);
  }

  @Get('blocked-attempts')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'Get recent geo-blocked attempts' })
  @ApiResponse({ status: 200, type: [GeoBlockedAttemptDto] })
  async getBlockedAttempts(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<GeoBlockedAttemptDto[]> {
    return this.geoRestrictionService.getBlockedAttempts(workspaceId);
  }

  // ==================== REFERENCE DATA ====================

  @Get('database-info')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Get GeoIP database status and metadata' })
  @ApiResponse({ status: 200, type: GeoIpDatabaseInfoDto })
  async getDatabaseInfo(): Promise<GeoIpDatabaseInfoDto> {
    return this.geoRestrictionService.getDatabaseInfo();
  }

  @Get('countries')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Get list of all ISO 3166-1 countries for the picker' })
  @ApiResponse({ status: 200, type: [CountryInfoDto] })
  async getCountryList(): Promise<CountryInfoDto[]> {
    return this.geoRestrictionService.getCountryList();
  }
}
