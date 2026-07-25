import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ProjectDocumentsService } from './project-documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { FillDocumentDto } from './dto/fill-document.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/document-templates')
export class ProjectDocumentsController {
  constructor(
    private readonly projectDocumentsService: ProjectDocumentsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.projectDocumentsService.listForProject(user.id, projectId);
  }

  @Post(':templateId/fill')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  async fill(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('templateId') templateId: string,
    @Body() dto: FillDocumentDto,
  ) {
    const { filename, buffer } = await this.projectDocumentsService.fill(
      user.id,
      projectId,
      templateId,
      dto,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
  }
}
