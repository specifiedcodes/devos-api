import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Request,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAdmin } from '../decorators/platform-admin.decorator';
import { AdminUsersService } from '../services/admin-users.service';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { SuspendUserDto, DeleteUserDto } from '../dto/admin-actions.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth('JWT-auth')
@Controller('api/admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @PlatformAdmin()
  async listUsers(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListUsersQueryDto,
  ) {
    return this.adminUsersService.listUsers(query);
  }

  @Get(':userId')
  @PlatformAdmin()
  async getUserDetail(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
  ) {
    const adminId = req.user?.userId || req.user?.id;
    return this.adminUsersService.getUserDetail(userId, adminId);
  }

  @Post(':userId/suspend')
  @PlatformAdmin()
  async suspendUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ValidationPipe({ whitelist: true })) body: SuspendUserDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.userId || req.user?.id;
    await this.adminUsersService.suspendUser(userId, adminId, body.reason, req);
    return { message: 'User suspended successfully', userId, status: 'suspended' };
  }

  @Post(':userId/unsuspend')
  @PlatformAdmin()
  async unsuspendUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
  ) {
    const adminId = req.user?.userId || req.user?.id;
    await this.adminUsersService.unsuspendUser(userId, adminId, req);
    return { message: 'User unsuspended successfully', userId, status: 'active' };
  }

  @Delete(':userId')
  @PlatformAdmin()
  async deleteUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ValidationPipe({ whitelist: true })) body: DeleteUserDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.userId || req.user?.id;
    await this.adminUsersService.deleteUser(userId, adminId, body.reason, req);
    return { message: 'User deleted successfully', userId, status: 'deleted' };
  }
}
