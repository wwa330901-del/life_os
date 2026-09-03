import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreatePermissionRuleDto } from './dto/create-permission-rule.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/permission-rules')
export class PermissionRulesController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.permissionsService.listRules(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePermissionRuleDto,
  ) {
    return this.permissionsService.createRule(user.id, spaceId, dto);
  }

  @Delete(':ruleId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.permissionsService.removeRule(user.id, spaceId, ruleId);
  }
}
