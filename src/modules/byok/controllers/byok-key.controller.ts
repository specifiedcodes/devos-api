import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { BYOKKeyService, RequestContext } from '../services/byok-key.service';
import { CreateBYOKKeyDto } from '../dto/create-byok-key.dto';
import { UsageService } from '../../usage/services/usage.service';
import { Request } from 'express';

@Controller('api/v1/workspaces/:workspaceId/byok-keys')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard, RoleGuard)
export class BYOKKeyController {
  constructor(
    private readonly byokKeyService: BYOKKeyService,
    @Inject(forwardRef(() => UsageService))
    private readonly usageService: UsageService,
  ) {}

  /**
   * Create a new BYOK key
   * Only owners and admins can add BYOK keys
   */
  @Post()
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  async createKey(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateBYOKKeyDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    const requestContext: RequestContext = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    };
    return this.byokKeyService.createKey(workspaceId, userId, dto, requestContext);
  }

  /**
   * Get all BYOK keys for a workspace
   * All workspace members can view keys (but not decrypt them)
   */
  @Get()
  async getWorkspaceKeys(@Param('workspaceId') workspaceId: string) {
    return this.byokKeyService.getWorkspaceKeys(workspaceId);
  }

  /**
   * Get a specific BYOK key by ID
   */
  @Get(':keyId')
  async getKeyById(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.byokKeyService.getKeyById(keyId, workspaceId);
  }

  /**
   * Delete a BYOK key
   * Only owners and admins can delete BYOK keys
   */
  @Delete(':keyId')
  @Roles(WorkspaceRole.OWNER, WorkspaceRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteKey(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    const requestContext: RequestContext = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    };
    await this.byokKeyService.deleteKey(keyId, workspaceId, userId, requestContext);
  }

  /**
   * Get usage statistics for a specific BYOK key
   * Integrated with Story 3.3 real-time cost tracking
   */
  @Get(':keyId/usage')
  async getKeyUsage(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
  ) {
    // Verify the key exists and belongs to the workspace
    const key = await this.byokKeyService.getKeyById(keyId, workspaceId);

    // Get usage data from Story 3.3 UsageService
    const usage = await this.usageService.getKeyUsage(keyId, workspaceId);

    // Calculate current month period
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    return {
      keyId,
      keyName: key.keyName,
      provider: key.provider,
      workspaceId,
      totalRequests: usage.requests,
      totalCost: usage.cost,
      lastUsedAt: key.lastUsedAt,
      period: {
        start: startOfMonth,
        end: endOfMonth,
      },
    };
  }
}
