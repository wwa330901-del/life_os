import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MyWorkspaceService } from './my-workspace.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/my-workspace')
export class MyWorkspaceController {
  constructor(private readonly service: MyWorkspaceService) {}

  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.service.get(user.id, spaceId);
  }
}
