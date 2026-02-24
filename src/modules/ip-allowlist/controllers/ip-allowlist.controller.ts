import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard, RequireRole } from '../../../common/guards/role.guard';
import { SkipIpCheck } from '../../../common/decorators/skip-ip-check.decorator';
import { Permission } from '../../../common/decorators/permission.decorator';
import { extractClientIp } from '../../../common/utils/extract-client-ip';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { IpAllowlistService } from '../services/ip-allowlist.service';
import { CreateIpEntryDto } from '../dto/create-ip-entry.dto';
import { UpdateIpEntryDto } from '../dto/update-ip-entry.dto';
import { UpdateIpConfigDto } from '../dto/update-ip-config.dto';
import {
  IpEntryResponseDto,
  IpConfigResponseDto,
  IpTestResponseDto,
  BlockedAttemptDto,
} from '../dto/ip-entry-response.dto';

@ApiTags('IP Allowlist')
@ApiBearerAuth('JWT-auth')
@Controller('api/v1/workspaces/:workspaceId/ip-allowlist')
@UseGuards(JwtAuthGuard, RoleGuard)
@SkipIpCheck() // IP allowlist management endpoints must always be accessible
export class IpAllowlistController {
  constructor(private readonly ipAllowlistService: IpAllowlistService) {}

  // ==================== CONFIG ====================

  @Get('config')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Get IP allowlist configuration' })
  @ApiResponse({ status: 200, type: IpConfigResponseDto })
  async getConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<IpConfigResponseDto> {
    return this.ipAllowlistService.getConfig(workspaceId);
  }

  @Put('config')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Enable or disable IP allowlisting' })
  @ApiResponse({ status: 200, type: IpConfigResponseDto })
  async updateConfig(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: UpdateIpConfigDto,
    @Req() req: any,
  ): Promise<IpConfigResponseDto> {
    const clientIp = extractClientIp(req);
    return this.ipAllowlistService.updateConfig(
      workspaceId,
      req.user.id,
      dto.isEnabled,
      clientIp,
    );
  }

  @Post('emergency-disable')
  @RequireRole(WorkspaceRole.OWNER)
  @ApiOperation({ summary: 'Emergency disable IP allowlisting for 1 hour (owner only)' })
  @ApiResponse({ status: 200, type: IpConfigResponseDto })
  async emergencyDisable(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<IpConfigResponseDto> {
    return this.ipAllowlistService.emergencyDisable(workspaceId, req.user.id);
  }

  // ==================== ENTRIES ====================

  @Get()
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'List all IP allowlist entries' })
  @ApiResponse({ status: 200, type: [IpEntryResponseDto] })
  async listEntries(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<IpEntryResponseDto[]> {
    return this.ipAllowlistService.listEntries(workspaceId);
  }

  @Post()
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Add IP address to allowlist' })
  @ApiResponse({ status: 201, type: IpEntryResponseDto })
  async createEntry(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body() dto: CreateIpEntryDto,
    @Req() req: any,
  ): Promise<IpEntryResponseDto> {
    return this.ipAllowlistService.createEntry(workspaceId, req.user.id, dto);
  }

  @Put(':entryId')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Update an IP allowlist entry' })
  @ApiResponse({ status: 200, type: IpEntryResponseDto })
  async updateEntry(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: UpdateIpEntryDto,
    @Req() req: any,
  ): Promise<IpEntryResponseDto> {
    return this.ipAllowlistService.updateEntry(workspaceId, entryId, req.user.id, dto);
  }

  @Delete(':entryId')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an IP allowlist entry' })
  @ApiResponse({ status: 204 })
  async deleteEntry(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Req() req: any,
  ): Promise<void> {
    return this.ipAllowlistService.deleteEntry(workspaceId, entryId, req.user.id);
  }

  // ==================== TESTING & MONITORING ====================

  @Post('test')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'manage_settings')
  @ApiOperation({ summary: 'Test if current IP is allowed' })
  @ApiResponse({ status: 200, type: IpTestResponseDto })
  async testIp(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Req() req: any,
  ): Promise<IpTestResponseDto> {
    const clientIp = extractClientIp(req);
    return this.ipAllowlistService.testIp(workspaceId, clientIp);
  }

  @Get('blocked-attempts')
  @RequireRole(WorkspaceRole.ADMIN)
  @Permission('workspace', 'view_audit_log')
  @ApiOperation({ summary: 'Get recent blocked IP attempts' })
  @ApiResponse({ status: 200, type: [BlockedAttemptDto] })
  async getBlockedAttempts(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<BlockedAttemptDto[]> {
    return this.ipAllowlistService.getBlockedAttempts(workspaceId);
  }

}
