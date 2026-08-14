import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DocumentApprovalsService } from './document-approvals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt-payload';
import { DecideDocumentApprovalStepDto } from './dto/decide-document-approval-step.dto';
import { AddApprovalStepNoteDto } from './dto/add-approval-step-note.dto';

/// Cross-project 簽核 queues ("待我簽核"/"我送出的") + per-step actions.
/// Not nested under a project route — a step's authorization is its own
/// `approverUserId`/the approval's `submittedByUserId`, not project
/// membership, and the whole point of these two list endpoints is to span
/// every project the caller has documents or approval duties in.
@UseGuards(JwtAuthGuard)
@Controller('document-approvals')
export class DocumentApprovalStepsController {
  constructor(private readonly service: DocumentApprovalsService) {}

  @Get('pending')
  pendingForMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.pendingForMe(user.id);
  }

  @Get('mine')
  mySubmissions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('cursor') cursor?: string,
  ) {
    return this.service.mySubmissions(user.id, { cursor });
  }

  @Post('steps/:stepId/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: DecideDocumentApprovalStepDto,
  ) {
    return this.service.approveStep(user.id, stepId, dto.comment);
  }

  @Post('steps/:stepId/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: DecideDocumentApprovalStepDto,
  ) {
    return this.service.rejectStep(user.id, stepId, dto.comment ?? '');
  }

  @Post('steps/:stepId/request-info')
  requestInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: AddApprovalStepNoteDto,
  ) {
    return this.service.requestInfo(user.id, stepId, dto.text);
  }

  @Post('steps/:stepId/reply')
  reply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stepId') stepId: string,
    @Body() dto: AddApprovalStepNoteDto,
  ) {
    return this.service.replyToNote(user.id, stepId, dto.text);
  }
}
