import { Module } from '@nestjs/common';
import { DocumentTemplatesController } from './document-templates.controller';
import { ProjectDocumentsController, GeneratedDocumentsController } from './project-documents.controller';
import { DocumentTemplatesService } from './document-templates.service';
import { ProjectDocumentsService } from './project-documents.service';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ProjectsModule, UsersModule],
  controllers: [DocumentTemplatesController, ProjectDocumentsController, GeneratedDocumentsController],
  providers: [DocumentTemplatesService, ProjectDocumentsService],
})
export class DocumentsModule {}
