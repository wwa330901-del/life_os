import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SpacesService } from '../spaces/spaces.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import {
  DocumentApprovalStatus,
  DocumentApprovalStepNoteType,
} from '../../generated/prisma/client.js';

/** The four things a DocumentApproval can be submitted against — see the
 * schema doc comment on DocumentApproval for why this was generalized
 * 2026-08-14 (工程財務四表 redesign) instead of staying GeneratedDocument-only. */
type ApprovalTargetType =
  | 'GENERATED_DOCUMENT'
  | 'COST_CONTROL_INITIAL_SHEET'
  | 'PROCUREMENT_COMPARISON'
  | 'PAYMENT_REQUEST_PERIOD';

interface ApprovalTargetRef {
  type: ApprovalTargetType;
  id: string;
}

const TARGET_FK_FIELD: Record<ApprovalTargetType, string> = {
  GENERATED_DOCUMENT: 'generatedDocumentId',
  COST_CONTROL_INITIAL_SHEET: 'costControlInitialSheetId',
  PROCUREMENT_COMPARISON: 'procurementComparisonId',
  PAYMENT_REQUEST_PERIOD: 'paymentRequestPeriodId',
};

/** Fixed 關卡職稱 chains for the three 工程財務 target types — the user
 * explicitly wants these step *counts and names* fixed per table type, while
 * who fills each step is still picked freely at submit time (see schema
 * comment on DocumentApprovalStep.roleLabel). GeneratedDocument keeps its
 * pre-existing free-form chain (no fixed roles at all). */
const FIXED_ROLE_CHAINS: Record<
  Exclude<ApprovalTargetType, 'GENERATED_DOCUMENT'>,
  string[]
> = {
  COST_CONTROL_INITIAL_SHEET: ['主辦', '業務主管', '成控', '總經理'],
  PROCUREMENT_COMPARISON: ['主辦', '業務主管', '成控', '總經理'],
  PAYMENT_REQUEST_PERIOD: [
    '主辦',
    '業務主管',
    '財務初審',
    '成控',
    '總經理',
    '出納',
  ],
};

/**
 * 簽核系統 — an ordered, per-submission approval chain attached to exactly
 * one of four target types (see ApprovalTargetType above). Only one target
 * type (GeneratedDocument) has a free-form, variable-length step chain
 * picked entirely by the submitter; the other three always create a fixed
 * number of named-role steps, with only the approverUserId per step chosen
 * at submit time. A step is only ever resolved by a real APPROVE or REJECT —
 * a REQUEST_INFO/REPLY note exchange can happen any number of times first
 * without changing anything's status. A REJECT ends the whole chain
 * immediately (no partial resume); the creator revises and submits a brand
 * new DocumentApproval. Once every step is APPROVED, the target is locked —
 * see `isLocked*` methods, each target's own service is responsible for
 * respecting that (e.g. blocking edits, and for CostControlInitialSheet,
 * lazily freezing `lockedSnapshotJson` on first read after lock).
 */
@Injectable()
export class DocumentApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly spacesService: SpacesService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  // ---------------------------------------------------------------------
  // GeneratedDocument — unchanged public surface (existing callers/routes)
  // ---------------------------------------------------------------------

  async submit(
    userId: string,
    projectId: string,
    documentId: string,
    approverUserIds: string[],
  ) {
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

    return this.createApproval(
      userId,
      { type: 'GENERATED_DOCUMENT', id: documentId },
      document.spaceId,
      approverUserIds.map((approverUserId) => ({
        approverUserId,
        roleLabel: null,
      })),
      '這份文件已經核准並鎖定了',
      '這份文件已經有一筆簽核正在進行中',
    );
  }

  async historyForDocument(
    userId: string,
    projectId: string,
    documentId: string,
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    const document = await this.prisma.generatedDocument.findUnique({
      where: { id: documentId },
    });
    if (!document || document.projectId !== projectId) {
      throw new NotFoundException('Generated document not found');
    }
    return this.historyForTarget({
      type: 'GENERATED_DOCUMENT',
      id: documentId,
    });
  }

  /** Whether this document has ever reached a fully-APPROVED sign-off —
   * called from ProjectDocumentsService.removeGenerated to block deleting
   * a locked, already-signed document. */
  async isLocked(documentId: string): Promise<boolean> {
    return this.isLockedForTarget({
      type: 'GENERATED_DOCUMENT',
      id: documentId,
    });
  }

  // ---------------------------------------------------------------------
  // 工程財務四表 — fixed-role-chain targets. Each feature module's own
  // controller calls these directly (no dedicated approvals controller per
  // target — the submit action lives on that target's own resource route).
  // ---------------------------------------------------------------------

  async submitCostControlInitialSheet(
    userId: string,
    projectId: string,
    approverUserIds: string[],
  ) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);

    const sheet = await this.prisma.costControlInitialSheet.upsert({
      where: { projectId },
      create: { projectId },
      update: {},
    });

    return this.createFixedRoleApproval(
      userId,
      { type: 'COST_CONTROL_INITIAL_SHEET', id: sheet.id },
      project.spaceId,
      approverUserIds,
      '這份初始管制表已經核准並鎖定了',
      '這份初始管制表已經有一筆簽核正在進行中',
    );
  }

  async submitProcurementComparison(
    userId: string,
    comparisonId: string,
    approverUserIds: string[],
  ) {
    const comparison = await this.prisma.procurementComparison.findUnique({
      where: { id: comparisonId },
      include: { project: true },
    });
    if (!comparison)
      throw new NotFoundException('Procurement comparison not found');
    await this.projectsService.assertAccess(userId, comparison.project);

    return this.createFixedRoleApproval(
      userId,
      { type: 'PROCUREMENT_COMPARISON', id: comparisonId },
      comparison.project.spaceId,
      approverUserIds,
      '這張採發比價表已經核准並鎖定了',
      '這張採發比價表已經有一筆簽核正在進行中',
    );
  }

  async submitPaymentRequestPeriod(
    userId: string,
    periodId: string,
    approverUserIds: string[],
  ) {
    const period = await this.prisma.paymentRequestPeriod.findUnique({
      where: { id: periodId },
      include: { costControlRow: { include: { project: true } } },
    });
    if (!period)
      throw new NotFoundException('Payment request period not found');
    await this.projectsService.assertAccess(
      userId,
      period.costControlRow.project,
    );

    return this.createFixedRoleApproval(
      userId,
      { type: 'PAYMENT_REQUEST_PERIOD', id: periodId },
      period.costControlRow.project.spaceId,
      approverUserIds,
      '這一期請款單已經核准並鎖定了',
      '這一期請款單已經有一筆簽核正在進行中',
    );
  }

  async isLockedForTarget(target: ApprovalTargetRef): Promise<boolean> {
    const approved = await this.prisma.documentApproval.findFirst({
      where: {
        [TARGET_FK_FIELD[target.type]]: target.id,
        status: DocumentApprovalStatus.APPROVED,
      },
    });
    return approved != null;
  }

  async historyForTarget(target: ApprovalTargetRef) {
    const approvals = await this.prisma.documentApproval.findMany({
      where: { [TARGET_FK_FIELD[target.type]]: target.id },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
          include: {
            approver: { select: { name: true } },
            notes: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const displayName = await this.resolveTargetDisplayName(target);
    return approvals.map((a) => this.toApprovalSummary(a, target, displayName));
  }

  // ---------------------------------------------------------------------
  // Step actions — target-agnostic (a step only knows its own approval,
  // which knows its own target via whichever FK is set).
  // ---------------------------------------------------------------------

  async approveStep(userId: string, stepId: string, comment?: string) {
    const { approval, step } = await this.getActionableStepOrThrow(
      userId,
      stepId,
    );

    await this.prisma.documentApprovalStep.update({
      where: { id: step.id },
      data: {
        status: DocumentApprovalStatus.APPROVED,
        decisionComment: comment ?? null,
        decidedAt: new Date(),
      },
    });

    const target = this.targetOf(approval);
    const displayName = await this.resolveTargetDisplayName(target);
    const nextStep = await this.prisma.documentApprovalStep.findUnique({
      where: {
        approvalId_sequence: {
          approvalId: approval.id,
          sequence: step.sequence + 1,
        },
      },
    });

    if (nextStep) {
      await this.lineNotifier.notifyByUser(
        nextStep.approverUserId,
        `📄 輪到你簽核：「${displayName}」${nextStep.roleLabel ? `（${nextStep.roleLabel}）` : ''}。`,
      );
    } else {
      await this.prisma.documentApproval.update({
        where: { id: approval.id },
        data: { status: DocumentApprovalStatus.APPROVED },
      });
      await this.lineNotifier.notifyByUser(
        approval.submittedByUserId,
        `✅「${displayName}」已全部核准，已鎖定。`,
      );
    }
  }

  async rejectStep(userId: string, stepId: string, comment: string) {
    if (!comment?.trim()) {
      throw new BadRequestException('退回必須填寫原因');
    }
    const { approval, step } = await this.getActionableStepOrThrow(
      userId,
      stepId,
    );

    await this.prisma.$transaction([
      this.prisma.documentApprovalStep.update({
        where: { id: step.id },
        data: {
          status: DocumentApprovalStatus.REJECTED,
          decisionComment: comment,
          decidedAt: new Date(),
        },
      }),
      this.prisma.documentApproval.update({
        where: { id: approval.id },
        data: { status: DocumentApprovalStatus.REJECTED },
      }),
    ]);

    const displayName = await this.resolveTargetDisplayName(
      this.targetOf(approval),
    );
    await this.lineNotifier.notifyByUser(
      approval.submittedByUserId,
      `❌「${displayName}」的簽核被退回：${comment}`,
    );
  }

  async requestInfo(userId: string, stepId: string, text: string) {
    const { approval, step } = await this.getActionableStepOrThrow(
      userId,
      stepId,
    );

    await this.prisma.documentApprovalStepNote.create({
      data: {
        stepId: step.id,
        authorUserId: userId,
        type: DocumentApprovalStepNoteType.REQUEST_INFO,
        text,
      },
    });

    const displayName = await this.resolveTargetDisplayName(
      this.targetOf(approval),
    );
    await this.lineNotifier.notifyByUser(
      approval.submittedByUserId,
      `❓ 簽核人對「${displayName}」有疑問：${text}`,
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
    if (
      step.approval.status !== DocumentApprovalStatus.PENDING ||
      step.status !== DocumentApprovalStatus.PENDING
    ) {
      throw new BadRequestException('這一關已經處理完成，不能再回覆');
    }
    await this.assertCurrentStep(step.approvalId, step.sequence);

    await this.prisma.documentApprovalStepNote.create({
      data: {
        stepId: step.id,
        authorUserId: userId,
        type: DocumentApprovalStepNoteType.REPLY,
        text,
      },
    });

    const displayName = await this.resolveTargetDisplayName(
      this.targetOf(step.approval),
    );
    await this.lineNotifier.notifyByUser(
      step.approverUserId,
      `💬 承辦人已針對「${displayName}」回覆說明，請再次確認。`,
    );
  }

  /** Cross-project — every step currently awaiting this user's action,
   * across all four target types. */
  async pendingForMe(userId: string) {
    const steps = await this.prisma.documentApprovalStep.findMany({
      where: {
        approverUserId: userId,
        status: DocumentApprovalStatus.PENDING,
        approval: { status: DocumentApprovalStatus.PENDING },
      },
      include: {
        approval: {
          include: { steps: true, submittedBy: { select: { name: true } } },
        },
      },
      orderBy: { approval: { createdAt: 'asc' } },
    });

    const actionable = steps.filter((step) =>
      step.approval.steps.every(
        (s) =>
          s.sequence >= step.sequence ||
          s.status === DocumentApprovalStatus.APPROVED,
      ),
    );

    return Promise.all(
      actionable.map(async (step) => {
        const target = this.targetOf(step.approval);
        const { displayName, projectId } = await this.resolveTargetInfo(target);
        return {
          stepId: step.id,
          sequence: step.sequence,
          roleLabel: step.roleLabel,
          totalSteps: step.approval.steps.length,
          targetType: target.type,
          targetId: target.id,
          targetDisplayName: displayName,
          projectId,
          submittedByUserId: step.approval.submittedByUserId,
          submittedByName: step.approval.submittedBy.name,
          createdAt: step.approval.createdAt,
        };
      }),
    );
  }

  /** Cross-project — every approval this user has submitted (all four
   * target types), with full step/note detail. Cursor-paginated (30/page) —
   * same reasoning as the pre-existing 知識庫/代辦事項 unbounded-list fixes,
   * see 大系統V1.46.0. */
  async mySubmissions(userId: string, filter: { cursor?: string } = {}) {
    const take = 30;
    const rows = await this.prisma.documentApproval.findMany({
      where: { submittedByUserId: userId },
      include: {
        steps: {
          orderBy: { sequence: 'asc' },
          include: {
            approver: { select: { name: true } },
            notes: { orderBy: { createdAt: 'asc' } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const items = await Promise.all(
      page.map(async (a) => {
        const target = this.targetOf(a);
        const displayName = await this.resolveTargetDisplayName(target);
        return this.toApprovalSummary(a, target, displayName);
      }),
    );
    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // ---------------------------------------------------------------------
  // Shared internals
  // ---------------------------------------------------------------------

  private async createFixedRoleApproval(
    userId: string,
    target: ApprovalTargetRef,
    spaceId: string,
    approverUserIds: string[],
    alreadyApprovedMessage: string,
    alreadyPendingMessage: string,
  ) {
    const roles =
      FIXED_ROLE_CHAINS[
        target.type as Exclude<ApprovalTargetType, 'GENERATED_DOCUMENT'>
      ];
    if (approverUserIds.length !== roles.length) {
      throw new BadRequestException(
        `這張表固定 ${roles.length} 關（${roles.join('→')}），請指定每一關的人`,
      );
    }
    return this.createApproval(
      userId,
      target,
      spaceId,
      approverUserIds.map((approverUserId, index) => ({
        approverUserId,
        roleLabel: roles[index],
      })),
      alreadyApprovedMessage,
      alreadyPendingMessage,
    );
  }

  private async createApproval(
    userId: string,
    target: ApprovalTargetRef,
    spaceId: string,
    steps: Array<{ approverUserId: string; roleLabel: string | null }>,
    alreadyApprovedMessage: string,
    alreadyPendingMessage: string,
  ) {
    const existing = await this.prisma.documentApproval.findFirst({
      where: {
        [TARGET_FK_FIELD[target.type]]: target.id,
        status: {
          in: [DocumentApprovalStatus.PENDING, DocumentApprovalStatus.APPROVED],
        },
      },
    });
    if (existing) {
      throw new BadRequestException(
        existing.status === DocumentApprovalStatus.APPROVED
          ? alreadyApprovedMessage
          : alreadyPendingMessage,
      );
    }

    const members = await this.spacesService.listMembers(userId, spaceId);
    const memberIds = new Set(members.map((m) => m.userId));
    for (const { approverUserId } of steps) {
      if (!memberIds.has(approverUserId)) {
        throw new BadRequestException('審核人必須是同一個公司空間的成員');
      }
    }

    const approval = await this.prisma.documentApproval.create({
      data: {
        [TARGET_FK_FIELD[target.type]]: target.id,
        submittedByUserId: userId,
        steps: {
          create: steps.map((s, index) => ({
            sequence: index + 1,
            approverUserId: s.approverUserId,
            roleLabel: s.roleLabel,
          })),
        },
      },
      include: { steps: { orderBy: { sequence: 'asc' } } },
    });

    const displayName = await this.resolveTargetDisplayName(target);
    const firstStep = approval.steps[0];
    await this.lineNotifier.notifyByUser(
      firstStep.approverUserId,
      `📄 有新的待你簽核：「${displayName}」${firstStep.roleLabel ? `（${firstStep.roleLabel}）` : ''}，請到元序 App 查看。`,
    );
    return approval;
  }

  /** Reads whichever of the four target FKs is non-null on an already-loaded
   * DocumentApproval row. */
  private targetOf(approval: {
    generatedDocumentId: string | null;
    costControlInitialSheetId: string | null;
    procurementComparisonId: string | null;
    paymentRequestPeriodId: string | null;
  }): ApprovalTargetRef {
    if (approval.generatedDocumentId)
      return { type: 'GENERATED_DOCUMENT', id: approval.generatedDocumentId };
    if (approval.costControlInitialSheetId)
      return {
        type: 'COST_CONTROL_INITIAL_SHEET',
        id: approval.costControlInitialSheetId,
      };
    if (approval.procurementComparisonId)
      return {
        type: 'PROCUREMENT_COMPARISON',
        id: approval.procurementComparisonId,
      };
    if (approval.paymentRequestPeriodId)
      return {
        type: 'PAYMENT_REQUEST_PERIOD',
        id: approval.paymentRequestPeriodId,
      };
    throw new Error('DocumentApproval row has no target set');
  }

  private async resolveTargetDisplayName(
    target: ApprovalTargetRef,
  ): Promise<string> {
    return (await this.resolveTargetInfo(target)).displayName;
  }

  /** N+1-per-approval on purpose — this whole module operates at personal/
   * small-company scale (tens of pending approvals at most), same tradeoff
   * this codebase makes elsewhere for low-volume cross-project lists. */
  private async resolveTargetInfo(
    target: ApprovalTargetRef,
  ): Promise<{ displayName: string; projectId: string }> {
    switch (target.type) {
      case 'GENERATED_DOCUMENT': {
        const doc = await this.prisma.generatedDocument.findUniqueOrThrow({
          where: { id: target.id },
        });
        return { displayName: doc.name, projectId: doc.projectId };
      }
      case 'COST_CONTROL_INITIAL_SHEET': {
        const sheet =
          await this.prisma.costControlInitialSheet.findUniqueOrThrow({
            where: { id: target.id },
            include: { project: { select: { id: true, name: true } } },
          });
        return {
          displayName: `《${sheet.project.name}》初始管制表`,
          projectId: sheet.project.id,
        };
      }
      case 'PROCUREMENT_COMPARISON': {
        const comparison =
          await this.prisma.procurementComparison.findUniqueOrThrow({
            where: { id: target.id },
            include: {
              project: { select: { id: true, name: true } },
              quotationLineItem: { select: { name: true } },
            },
          });
        return {
          displayName: `《${comparison.project.name}》${comparison.quotationLineItem.name}採發比價表`,
          projectId: comparison.project.id,
        };
      }
      case 'PAYMENT_REQUEST_PERIOD': {
        const period = await this.prisma.paymentRequestPeriod.findUniqueOrThrow(
          {
            where: { id: target.id },
            include: {
              costControlRow: {
                include: { project: { select: { id: true, name: true } } },
              },
            },
          },
        );
        return {
          displayName: `《${period.costControlRow.project.name}》${period.costControlRow.name}請款單－${period.periodLabel}`,
          projectId: period.costControlRow.project.id,
        };
      }
    }
  }

  private toApprovalSummary(
    a: {
      id: string;
      submittedByUserId: string;
      status: DocumentApprovalStatus;
      createdAt: Date;
      steps: Array<{
        id: string;
        sequence: number;
        roleLabel: string | null;
        approverUserId: string;
        approver: { name: string };
        status: DocumentApprovalStatus;
        decisionComment: string | null;
        decidedAt: Date | null;
        notes: Array<{
          id: string;
          authorUserId: string;
          type: DocumentApprovalStepNoteType;
          text: string;
          createdAt: Date;
        }>;
      }>;
    },
    target: ApprovalTargetRef,
    targetDisplayName: string,
  ) {
    return {
      id: a.id,
      targetType: target.type,
      targetId: target.id,
      targetDisplayName,
      submittedByUserId: a.submittedByUserId,
      status: a.status,
      createdAt: a.createdAt,
      steps: a.steps.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        roleLabel: s.roleLabel,
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
      where: {
        approvalId,
        sequence: { lt: sequence },
        status: { not: DocumentApprovalStatus.APPROVED },
      },
    });
    if (notYetApproved > 0) {
      throw new BadRequestException('還沒輪到這一關');
    }
  }
}
