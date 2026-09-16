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
import { ContactRecordsService } from './contact-records.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateContactRecordDto } from './dto/create-contact-record.dto';
import { UpdateContactRecordDto } from './dto/update-contact-record.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/contact-records')
export class ContactRecordsController {
  constructor(private readonly contactRecordsService: ContactRecordsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.contactRecordsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateContactRecordDto,
  ) {
    return this.contactRecordsService.create(user.id, projectId, dto);
  }

  @Patch(':recordId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateContactRecordDto,
  ) {
    return this.contactRecordsService.update(user.id, projectId, recordId, dto);
  }

  @Delete(':recordId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.contactRecordsService.remove(user.id, projectId, recordId);
  }
}
