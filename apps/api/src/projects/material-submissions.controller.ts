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
import { MaterialSubmissionsService } from './material-submissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { CreateMaterialSubmissionDto } from './dto/create-material-submission.dto';
import { ReviewMaterialSubmissionDto } from './dto/review-material-submission.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/material-submissions')
export class MaterialSubmissionsController {
  constructor(
    private readonly materialSubmissionsService: MaterialSubmissionsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.materialSubmissionsService.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateMaterialSubmissionDto,
  ) {
    return this.materialSubmissionsService.create(user.id, projectId, dto);
  }

  @Patch(':submissionId/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: ReviewMaterialSubmissionDto,
  ) {
    return this.materialSubmissionsService.review(
      user.id,
      projectId,
      submissionId,
      dto,
    );
  }

  @Delete(':submissionId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.materialSubmissionsService.remove(
      user.id,
      projectId,
      submissionId,
    );
  }
}
