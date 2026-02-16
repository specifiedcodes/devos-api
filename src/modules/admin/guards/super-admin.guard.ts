import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../database/entities/user.entity';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId || request.user?.id;

    if (!userId) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'isPlatformAdmin'],
    });

    if (!user || !user.isPlatformAdmin) {
      throw new ForbiddenException('Platform administrator access required');
    }

    return true;
  }
}
