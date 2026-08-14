import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { SpacesModule } from '../spaces/spaces.module';
import { LineNotifierModule } from '../line-notifier/line-notifier.module';
import { DocumentApprovalsService } from './document-approvals.service';
import { GeneratedDocumentApprovalsController } from './generated-document-approvals.controller';
import { DocumentApprovalStepsController } from './document-approval-steps.controller';

@Module({
  imports: [ProjectsModule, SpacesModule, LineNotifierModule],
  controllers: [
    GeneratedDocumentApprovalsController,
    DocumentApprovalStepsController,
  ],
  providers: [DocumentApprovalsService],
  // Reused by ProjectDocumentsService (DocumentsModule) to block deleting a
  // locked, already-signed-off document.
  exports: [DocumentApprovalsService],
})
export class DocumentApprovalsModule {}
