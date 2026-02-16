import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ScimAuthGuard } from './guards/scim-auth.guard';
import { ScimUserService } from './scim-user.service';
import { SCIM_CONSTANTS } from '../constants/scim.constants';
import {
  ScimUserResource,
  ScimListResponse,
  ScimCreateUserRequest,
  ScimPatchRequest,
} from '../dto/scim.dto';

@Controller('scim/v2/Users')
@UseGuards(ScimAuthGuard)
export class ScimUserController {
  constructor(private readonly scimUserService: ScimUserService) {}

  /**
   * GET /scim/v2/Users
   */
  @Get()
  async listUsers(
    @Req() req: Request,
    @Res() res: Response,
    @Query('filter') filter?: string,
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ascending' | 'descending',
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const result = await this.scimUserService.listUsers(
      workspaceId,
      filter,
      startIndex ? parseInt(startIndex, 10) : undefined,
      count ? parseInt(count, 10) : undefined,
      sortBy,
      sortOrder,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * GET /scim/v2/Users/:id
   */
  @Get(':id')
  async getUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const result = await this.scimUserService.getUser(workspaceId, id);
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * POST /scim/v2/Users
   */
  @Post()
  async createUser(
    @Body() body: ScimCreateUserRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const scimConfig = (req as any).scimConfig;
    const ipAddress = this.getIpAddress(req);
    const result = await this.scimUserService.createUser(
      workspaceId,
      body,
      scimConfig,
      ipAddress,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.setHeader('Location', `/scim/v2/Users/${result.id}`);
    res.status(201).json(result);
  }

  /**
   * PUT /scim/v2/Users/:id
   */
  @Put(':id')
  async replaceUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScimCreateUserRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const scimConfig = (req as any).scimConfig;
    const ipAddress = this.getIpAddress(req);
    const result = await this.scimUserService.replaceUser(
      workspaceId,
      id,
      body,
      scimConfig,
      ipAddress,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * PATCH /scim/v2/Users/:id
   */
  @Patch(':id')
  async patchUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScimPatchRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const scimConfig = (req as any).scimConfig;
    const ipAddress = this.getIpAddress(req);
    const result = await this.scimUserService.patchUser(
      workspaceId,
      id,
      body,
      scimConfig,
      ipAddress,
    );
    res.setHeader('Content-Type', SCIM_CONSTANTS.CONTENT_TYPE);
    res.status(200).json(result);
  }

  /**
   * DELETE /scim/v2/Users/:id
   */
  @Delete(':id')
  async deleteUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const workspaceId = (req as any).scimWorkspaceId;
    const scimConfig = (req as any).scimConfig;
    const ipAddress = this.getIpAddress(req);
    await this.scimUserService.deleteUser(
      workspaceId,
      id,
      scimConfig,
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
