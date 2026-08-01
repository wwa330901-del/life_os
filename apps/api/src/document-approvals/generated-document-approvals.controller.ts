import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DocumentApprovalsService } from './document-approvals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { SubmitDocumentApprovalDto } from './dto/submit-document-approval.dto';

/// 送簽 + 簽核歷程 for one specific GeneratedDocument — nested the same way
/// GeneratedDocumentsController is, so a document's own approval trail
/// reads as part of that document's resource.
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/documents/:documentId/approvals')
export class GeneratedDocumentApprovalsController {
  constructor(private readonly service: DocumentApprovalsService) {}

  @Get()
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.service.historyForDocument(user.id, projectId, documentId);
  }

  @Post()
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() dto: SubmitDocumentApprovalDto,
  ) {
    return this.service.submit(user.id, projectId, documentId, dto.approverUserIds);
  }
}
