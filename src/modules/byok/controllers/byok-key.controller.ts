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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../../../common/guards/role.guard';
import { WorkspaceAccessGuard } from '../../../shared/guards/workspace-access.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { WorkspaceRole } from '../../../database/entities/workspace-member.entity';
import { BYOKKeyService } from '../services/byok-key.service';
import { CreateBYOKKeyDto } from '../dto/create-byok-key.dto';

@Controller('api/v1/workspaces/:workspaceId/byok-keys')
@UseGuards(JwtAuthGuard, WorkspaceAccessGuard, RoleGuard)
export class BYOKKeyController {
  constructor(private readonly byokKeyService: BYOKKeyService) {}

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
    return this.byokKeyService.createKey(workspaceId, userId, dto);
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
    await this.byokKeyService.deleteKey(keyId, workspaceId, userId);
  }

  /**
   * Get usage statistics for a specific BYOK key
   * Stub endpoint for Story 3.3
   */
  @Get(':keyId/usage')
  async getKeyUsage(
    @Param('workspaceId') workspaceId: string,
    @Param('keyId') keyId: string,
  ) {
    // Verify the key exists and belongs to the workspace
    await this.byokKeyService.getKeyById(keyId, workspaceId);

    // Return stub data for now - will be implemented in Story 3.3
    return {
      keyId,
      workspaceId,
      totalRequests: 0,
      totalTokens: 0,
      estimatedCost: 0,
      lastUsedAt: null,
      period: {
        start: new Date(),
        end: new Date(),
      },
      message: 'Usage tracking will be available in Story 3.3',
    };
  }
}
