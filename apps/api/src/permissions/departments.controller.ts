import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateDepartmentRankDto } from './dto/create-department-rank.dto';
import { UpdateDepartmentRankDto } from './dto/update-department-rank.dto';
import { AssignMemberDepartmentDto } from './dto/assign-member-department.dto';
import { SetGeneralManagerDto } from './dto/set-general-manager.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId')
export class DepartmentsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('departments')
  listDepartments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.permissionsService.listDepartments(user.id, spaceId);
  }

  @Post('departments')
  createDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.permissionsService.createDepartment(user.id, spaceId, dto);
  }

  @Patch('departments/:departmentId')
  updateDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('departmentId') departmentId: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.permissionsService.updateDepartment(
      user.id,
      spaceId,
      departmentId,
      dto,
    );
  }

  @Delete('departments/:departmentId')
  removeDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('departmentId') departmentId: string,
  ) {
    return this.permissionsService.removeDepartment(
      user.id,
      spaceId,
      departmentId,
    );
  }

  @Post('departments/:departmentId/ranks')
  createRank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('departmentId') departmentId: string,
    @Body() dto: CreateDepartmentRankDto,
  ) {
    return this.permissionsService.createRank(
      user.id,
      spaceId,
      departmentId,
      dto,
    );
  }

  @Patch('departments/:departmentId/ranks/:rankId')
  updateRank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('departmentId') departmentId: string,
    @Param('rankId') rankId: string,
    @Body() dto: UpdateDepartmentRankDto,
  ) {
    return this.permissionsService.updateRank(
      user.id,
      spaceId,
      departmentId,
      rankId,
      dto,
    );
  }

  @Delete('departments/:departmentId/ranks/:rankId')
  removeRank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('departmentId') departmentId: string,
    @Param('rankId') rankId: string,
  ) {
    return this.permissionsService.removeRank(
      user.id,
      spaceId,
      departmentId,
      rankId,
    );
  }

  @Patch('members/:userId/department')
  assignMemberDepartment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: AssignMemberDepartmentDto,
  ) {
    return this.permissionsService.assignMemberDepartment(
      user.id,
      spaceId,
      targetUserId,
      dto,
    );
  }

  @Get('general-manager')
  getGeneralManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
  ) {
    return this.permissionsService.getGeneralManager(user.id, spaceId);
  }

  @Patch('general-manager')
  setGeneralManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: SetGeneralManagerDto,
  ) {
    return this.permissionsService.setGeneralManager(user.id, spaceId, dto);
  }
}
