import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import type { AuthenticatedUser } from '../jwt-payload';

/// Must run after JwtAuthGuard (needs `request.user` already populated).
/// Re-checks the DB rather than trusting a claim baked into the JWT, so
/// revoking admin access takes effect immediately, not on next login.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    const user = await this.usersService.findById(request.user.id);
    if (!user?.isPlatformAdmin) {
      throw new ForbiddenException('僅限平台管理員使用');
    }
    return true;
  }
}
