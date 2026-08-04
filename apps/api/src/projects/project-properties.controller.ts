import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProjectPropertiesService } from './project-properties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreatePropertyDefinitionDto, RenamePropertyDefinitionDto } from './dto/property-definition.dto';
import { PropertyOptionDto } from './dto/property-option.dto';
import { ReorderPropertyDefinitionDto } from './dto/reorder-property-definition.dto';
import { UpdateNamingTemplateDto } from './dto/naming-template.dto';

@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/properties')
export class ProjectPropertiesController {
  constructor(private readonly propertiesService: ProjectPropertiesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.propertiesService.list(user.id, spaceId);
  }

  @Get('naming-template')
  getNamingTemplate(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.propertiesService.getNamingTemplate(user.id, spaceId);
  }

  @Patch('naming-template')
  updateNamingTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: UpdateNamingTemplateDto,
  ) {
    return this.propertiesService.updateNamingTemplate(user.id, spaceId, dto);
  }

  @Delete('naming-template')
  clearNamingTemplate(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.propertiesService.clearNamingTemplate(user.id, spaceId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() dto: CreatePropertyDefinitionDto,
  ) {
    return this.propertiesService.create(user.id, spaceId, dto);
  }

  @Patch(':definitionId')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: RenamePropertyDefinitionDto,
  ) {
    return this.propertiesService.rename(user.id, spaceId, definitionId, dto);
  }

  @Patch(':definitionId/reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: ReorderPropertyDefinitionDto,
  ) {
    return this.propertiesService.reorder(user.id, spaceId, definitionId, dto);
  }

  @Delete(':definitionId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
  ) {
    return this.propertiesService.remove(user.id, spaceId, definitionId);
  }

  @Post(':definitionId/options')
  addOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: PropertyOptionDto,
  ) {
    return this.propertiesService.addOption(user.id, spaceId, definitionId, dto);
  }

  @Patch(':definitionId/options/:optionId')
  renameOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
    @Param('optionId') optionId: string,
    @Body() dto: PropertyOptionDto,
  ) {
    return this.propertiesService.renameOption(user.id, spaceId, definitionId, optionId, dto);
  }

  @Delete(':definitionId/options/:optionId')
  removeOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Param('definitionId') definitionId: string,
    @Param('optionId') optionId: string,
  ) {
    return this.propertiesService.removeOption(user.id, spaceId, definitionId, optionId);
  }
}
