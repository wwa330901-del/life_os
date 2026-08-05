import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SpacesService } from '../spaces/spaces.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { DocumentApprovalStatus, DocumentApprovalStepNoteType } from '../../generated/prisma/client.js';

/**
 * 簽核系統 — an ordered, per-submission approval chain attached to one
 * GeneratedDocument. Only documents whose template has `requiresApproval`
 * can be submitted; only the document's own creator may submit; approvers
 * are picked per submission from the document's own company space's
 * members (see SubmitDocumentApprovalDto). A step is only ever resolved by
 * a real APPROVE or REJECT — a REQUEST_INFO/REPLY note exchange can happen
 * any number of times first without changing anything's status. A REJECT
 * ends the whole chain immediately (no partial resume); the creator revises
 * and submits a brand new DocumentApproval. Once every step is APPROVED,
 * the document is locked — see `isLocked`, called from
 * `ProjectDocumentsService.removeGenerated`.
 */
@Injectable()
export class DocumentApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly spacesService: SpacesService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  async submit(userId: string, projectId: string, documentId: string, approverUserIds: string[]) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const document = await this.prisma.generatedDocument.findUnique({
      where: { id: documentId },
      include: { template: true },
    });
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Generated document not found');
    }
    if (document.createdByUserId !== userId) {
      throw new ForbiddenException('只有文件建立者本人可以送簽');
    }
    if (!document.template?.requiresApproval) {
      throw new BadRequestException('這份文件的範本沒有設定需要簽核');
    }

    const existing = await this.prisma.documentApproval.findFirst({
      where: {
        generatedDocumentId: documentId,
        status: { in: [DocumentApprovalStatus.PENDING, DocumentApprovalStatus.APPROVED] },
      },
    });
    if (existing) {
      throw new BadRequestException(
        existing.status === DocumentApprovalStatus.APPROVED
          ? '這份文件已經核准並鎖定了'
          : '這份文件已經有一筆簽核正在進行中',
      );
    }

    const members = await this.spacesService.listMembers(userId, document.spaceId);
    const memberIds = new Set(members.map((m) => m.userId));
    for (const approverUserId of approverUserIds) {
      if (!memberIds.has(approverUserId)) {
        throw new BadRequestException('審核人必須是同一個公司空間的成員');
      }
    }

    const approval = await this.prisma.documentApproval.create({
      data: {
        generatedDocumentId: documentId,
        submittedByUserId: userId,
        steps: {
          create: approverUserIds.map((approverUserId, index) => ({
            sequence: index + 1,
            approverUserId,
          })),
        },
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    await this.lineNotifier.notifyByUser(
      approval.steps[0].approverUserId,
      `📄 有新文件待你簽核：「${document.name}」，請到元序 App 查看。`,
    );
    return approval;
  }

  async approveStep(userId: string, stepId: string, comment?: string) {
    const { approval, step } = await this.getActionableStepOrThrow(userId, stepId);

    await this.prisma.documentApprovalStep.update({
      where: { id: step.id },
      data: { status: DocumentApprovalStatus.APPROVED, decisionComment: comment ?? null, decidedAt: new Date() },
    });

    const document = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id: approval.generatedDocumentId },
    });
    const nextStep = await this.prisma.documentApprovalStep.findUnique({
      where: { approvalId_sequence: { approvalId: approval.id, sequence: step.sequence + 1 } },
    });

    if (nextStep) {
      await this.lineNotifier.notifyByUser(
        nextStep.approverUserId,
        `📄 輪到你簽核：「${document.name}」。`,
      );
    } else {
      await this.prisma.documentApproval.update({
        where: { id: approval.id },
        data: { status: DocumentApprovalStatus.APPROVED },
      });
      await this.lineNotifier.notifyByUser(
        approval.submittedByUserId,
        `✅「${document.name}」已全部核准，文件已鎖定。`,
      );
    }
  }

  async rejectStep(userId: string, stepId: string, comment: string) {
    if (!comment?.trim()) {
      throw new BadRequestException('退回必須填寫原因');
    }
    const { approval, step } = await this.getActionableStepOrThrow(userId, stepId);

    await this.prisma.$transaction([
      this.prisma.documentApprovalStep.update({
        where: { id: step.id },
        data: { status: DocumentApprovalStatus.REJECTED, decisionComment: comment, decidedAt: new Date() },
      }),
      this.prisma.documentApproval.update({
        where: { id: approval.id },
        data: { status: DocumentApprovalStatus.REJECTED },
      }),
    ]);

    const document = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id: approval.generatedDocumentId },
    });
    await this.lineNotifier.notifyByUser(
      approval.submittedByUserId,
      `❌「${document.name}」的簽核被退回：${comment}`,
    );
  }

  async requestInfo(userId: string, stepId: string, text: string) {
    const { approval, step } = await this.getActionableStepOrThrow(userId, stepId);

    await this.prisma.documentApprovalStepNote.create({
      data: { stepId: step.id, authorUserId: userId, type: DocumentApprovalStepNoteType.REQUEST_INFO, text },
    });

    const document = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id: approval.generatedDocumentId },
    });
    await this.lineNotifier.notifyByUser(
      approval.submittedByUserId,
      `❓ 簽核人對「${document.name}」有疑問：${text}`,
    );
  }

  async replyToNote(userId: string, stepId: string, text: string) {
    const step = await this.prisma.documentApprovalStep.findUnique({
      where: { id: stepId },
      include: { approval: true },
    });
    if (!step) throw new NotFoundException('Approval step not found');
    if (step.approval.submittedByUserId !== userId) {
      throw new ForbiddenException('只有這筆簽核的建立者可以回覆');
    }
    if (step.approval.status !== DocumentApprovalStatus.PENDING || step.status !== DocumentApprovalStatus.PENDING) {
      throw new BadRequestException('這一關已經處理完成，不能再回覆');
    }
    await this.assertCurrentStep(step.approvalId, step.sequence);

    await this.prisma.documentApprovalStepNote.create({
      data: { stepId: step.id, authorUserId: userId, type: DocumentApprovalStepNoteType.REPLY, text },
    });

    const document = await this.prisma.generatedDocument.findUniqueOrThrow({
      where: { id: step.approval.generatedDocumentId },
    });
    await this.lineNotifier.notifyByUser(
      step.approverUserId,
      `💬 承辦人已針對「${document.name}」回覆說明，請再次確認。`,
    );
  }

  /** Cross-project — every step currently awaiting this user's action. */
  async pendingForMe(userId: string) {
    const steps = await this.prisma.documentApprovalStep.findMany({
      where: {
        approverUserId: userId,
        status: DocumentApprovalStatus.PENDING,
        approval: { status: DocumentApprovalStatus.PENDING },
      },
      include: {
        approval: {
          include: {
            generatedDocument: true,
            steps: true,
            submittedBy: { select: { name: true } },
          },
        },
      },
      orderBy: { approval: { createdAt: 'asc' } },
    });

    return steps
      .filter((step) =>
        step.approval.steps.every((s) => s.sequence >= step.sequence || s.status === DocumentApprovalStatus.APPROVED),
      )
      .map((step) => ({
        stepId: step.id,
        sequence: step.sequence,
        totalSteps: step.approval.steps.length,
        documentId: step.approval.generatedDocumentId,
        documentName: step.approval.generatedDocument.name,
        projectId: step.approval.generatedDocument.projectId,
        submittedByUserId: step.approval.submittedByUserId,
        submittedByName: step.approval.submittedBy.name,
        createdAt: step.approval.createdAt,
      }));
  }

  /** Cross-project — every approval this user has submitted, with full
   * step/note detail so the app can show "目前卡在誰那裡". */
  /** Cursor-paginated (30/page) — this used to fetch every approval the
   * caller has ever submitted unconditionally, each with a fairly deep
   * nested include (every step + every note), the same unbounded-list
   * problem fixed elsewhere for 知識庫/代辦事項 (see 大系統V1.46.0). Unlike
   * `finance-loans.service.ts`'s equivalent list, nothing else in the
   * codebase depends on this returning a complete unfiltered set, so plain
   * cursor pagination is safe here. */
  async mySubmissions(userId: string, filter: { cursor?: string } = {}) {
    const take = 30;
    const rows = await this.prisma.documentApproval.findMany({
      where: { submittedByUserId: userId },
      include: {
        generatedDocument: true,
        steps: {
          orderBy: { sequence: 'asc' },
          include: { approver: { select: { name: true } }, notes: { orderBy: { createdAt: 'asc' } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((a) => this.toApprovalSummary(a)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async historyForDocument(userId: string, projectId: string, documentId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    const document = await this.prisma.generatedDocument.findUnique({ where: { id: documentId } });
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Generated document not found');
    }

    const approvals = await this.prisma.documentApproval.findMany({
      where: { generatedDocumentId: documentId },
      include: {
        generatedDocument: true,
        steps: {
          orderBy: { sequence: 'asc' },
          include: { approver: { select: { name: true } }, notes: { orderBy: { createdAt: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return approvals.map((a) => this.toApprovalSummary(a));
  }

  /** Whether this document has ever reached a fully-APPROVED sign-off —
   * called from ProjectDocumentsService.removeGenerated to block deleting
   * a locked, already-signed document. */
  async isLocked(documentId: string): Promise<boolean> {
    const approved = await this.prisma.documentApproval.findFirst({
      where: { generatedDocumentId: documentId, status: DocumentApprovalStatus.APPROVED },
    });
    return approved != null;
  }

  private toApprovalSummary(a: {
    id: string;
    generatedDocumentId: string;
    generatedDocument: { name: string; projectId: string };
    submittedByUserId: string;
    status: DocumentApprovalStatus;
    createdAt: Date;
    steps: Array<{
      id: string;
      sequence: number;
      approverUserId: string;
      approver: { name: string };
      status: DocumentApprovalStatus;
      decisionComment: string | null;
      decidedAt: Date | null;
      notes: Array<{ id: string; authorUserId: string; type: DocumentApprovalStepNoteType; text: string; createdAt: Date }>;
    }>;
  }) {
    return {
      id: a.id,
      documentId: a.generatedDocumentId,
      documentName: a.generatedDocument.name,
      projectId: a.generatedDocument.projectId,
      submittedByUserId: a.submittedByUserId,
      status: a.status,
      createdAt: a.createdAt,
      steps: a.steps.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        approverUserId: s.approverUserId,
        approverName: s.approver.name,
        status: s.status,
        decisionComment: s.decisionComment,
        decidedAt: s.decidedAt,
        notes: s.notes.map((n) => ({
          id: n.id,
          authorUserId: n.authorUserId,
          type: n.type,
          text: n.text,
          createdAt: n.createdAt,
        })),
      })),
    };
  }

  private async getActionableStepOrThrow(userId: string, stepId: string) {
    const step = await this.prisma.documentApprovalStep.findUnique({
      where: { id: stepId },
      include: { approval: true },
    });
    if (!step) throw new NotFoundException('Approval step not found');
    if (step.approverUserId !== userId) {
      throw new ForbiddenException('這一關不是指派給你的');
    }
    if (step.approval.status !== DocumentApprovalStatus.PENDING) {
      throw new BadRequestException('這筆簽核已經結束了');
    }
    if (step.status !== DocumentApprovalStatus.PENDING) {
      throw new BadRequestException('這一關已經處理過了');
    }
    await this.assertCurrentStep(step.approvalId, step.sequence);
    return { approval: step.approval, step };
  }

  /** A step is only actionable once every earlier-sequence step in the same
   * approval has been APPROVED — otherwise it's not this approver's turn
   * yet, regardless of the step's own PENDING status. */
  private async assertCurrentStep(approvalId: string, sequence: number) {
    if (sequence === 1) return;
    const notYetApproved = await this.prisma.documentApprovalStep.count({
      where: { approvalId, sequence: { lt: sequence }, status: { not: DocumentApprovalStatus.APPROVED } },
    });
    if (notYetApproved > 0) {
      throw new BadRequestException('還沒輪到這一關');
    }
  }
}
