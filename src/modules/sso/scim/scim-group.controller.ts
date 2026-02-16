import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ScimAuthGuard } from './guards/scim-auth.guard';
import { ScimGroupService } from './scim-group.service';
import { SCIM_CONSTANTS } from '../constants/scim.constants';
import {
  ScimGroupMember,
  ScimPatchRequest,
} from '../dto/scim.dto';

@Controller('scim/v2/Groups')
@UseGuards(ScimAuthGuard)
export class ScimGroupController {
  constructor(private readonly scimGroupService: ScimGroupService) {}

  /**
   * GET /scim/v2/Groups
   */
  @Get()
  async listGroups(
    @Req() req: Request,
    @Res() res: Response,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const result = await this.scimGroupService.listGroups(
      workspaceId,
      filter,
      startIndex ? parseInt(startIndex, 10) : undefined,
      count ? parseInt(count, 10) : undefined,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * GET /scim/v2/Groups/:id
   */
  @Get(':id')
  async getGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const result = await this.scimGroupService.getGroup(workspaceId, id);
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * POST /scim/v2/Groups
   */
  @Post()
  async createGroup(
    @Body() body: { schemas: string[]; displayName: string; externalId?: string; members?: ScimGroupMember[] },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const ipAddress = this.getIpAddress(req);
    const result = await this.scimGroupService.createGroup(
      workspaceId,
      body,
      ipAddress,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.setHeader('Location', `/scim/v2/Groups/${result.id}`);
    res.status(201).json(result);
  }

  /**
   * PATCH /scim/v2/Groups/:id
   */
  @Patch(':id')
  async patchGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScimPatchRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const ipAddress = this.getIpAddress(req);
    const result = await this.scimGroupService.patchGroup(
      workspaceId,
      id,
      body,
      ipAddress,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * DELETE /scim/v2/Groups/:id
   */
  @Delete(':id')
  async deleteGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const ipAddress = this.getIpAddress(req);
    await this.scimGroupService.deleteGroup(
      workspaceId,
      id,
      ipAddress,
    );
    res.status(204).send();
  }

  private getIpAddress(request: Request): string {
    return (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      '';
  }
}
