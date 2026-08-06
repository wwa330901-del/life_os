import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SpacesService } from '../spaces/spaces.service';
import { CostControlService } from './cost-control.service';
import { LineNotifierService } from '../line-notifier/line-notifier.service';
import { DocumentApprovalStatus } from '../../generated/prisma/client.js';
import type { PaymentRequest } from '../../generated/prisma/client.js';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { DecidePaymentRequestStageDto } from './dto/decide-payment-request-stage.dto';

export type PaymentRequestStage =
  | 'salesManager'
  | 'financeReview'
  | 'costControlApprover'
  | 'generalManager'
  | 'accounting';

/** 5 關固定順序（承辦人本人送出不算一關）。 */
const STAGE_ORDER: PaymentRequestStage[] = [
  'salesManager',
  'financeReview',
  'costControlApprover',
  'generalManager',
  'accounting',
];

const STAGE_LABEL: Record<PaymentRequestStage, string> = {
  salesManager: '業務主管',
  financeReview: '財務初審',
  costControlApprover: '成控',
  generalManager: '總經理',
  accounting: '會計出納',
};

function userIdField(stage: PaymentRequestStage): keyof PaymentRequest {
  return `${stage}UserId` as keyof PaymentRequest;
}
function statusField(stage: PaymentRequestStage): keyof PaymentRequest {
  return `${stage}Status` as keyof PaymentRequest;
}

/**
 * 工程請款單 — 廠商向我們請款，對應唯一一列成控管制表列。固定五關依序
 * 簽核（業務主管→財務初審→成控→總經理→會計出納），送出時由承辦人指定
 * 各關負責人（同 DocumentApprovalsService 的模式：審核人必須是同一個
 * 公司空間成員）。任何一關 REJECTED 整筆終止，需重新送一筆新的——同一套
 * 「不可恢復、重新送件」慣例。
 */
@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly spacesService: SpacesService,
    private readonly costControlService: CostControlService,
    private readonly lineNotifier: LineNotifierService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    return this.prisma.paymentRequest.findMany({
      where: { costControlRow: { projectId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(userId: string, projectId: string, paymentRequestId: string) {
    await this.getAuthorizedProject(userId, projectId);
    return this.getRequestOrThrow(projectId, paymentRequestId);
  }

  async create(userId: string, projectId: string, dto: CreatePaymentRequestDto) {
    const project = await this.getAuthorizedProject(userId, projectId);

    const row = await this.prisma.costControlRow.findUnique({ where: { id: dto.costControlRowId } });
    if (!row || row.projectId !== projectId) {
      throw new BadRequestException('成控列不存在或不屬於這個專案');
    }

    const approverIds = [
      dto.salesManagerUserId,
      dto.financeReviewUserId,
      dto.costControlApproverUserId,
      dto.generalManagerUserId,
      dto.accountingUserId,
    ];
    const members = await this.spacesService.listMembers(userId, project.spaceId);
    const memberIds = new Set(members.map((m) => m.userId));
    for (const approverId of approverIds) {
      if (!memberIds.has(approverId)) {
        throw new BadRequestException('各關簽核人必須是同一個公司空間的成員');
      }
    }

    const { contractAmount, billedPercent } = await this.costControlService.getContractSnapshot(row.id);

    const created = await this.prisma.paymentRequest.create({
      data: {
        costControlRowId: row.id,
        vendorName: dto.vendorName,
        amount: dto.amount,
        requestDate: new Date(dto.requestDate),
        note: dto.note,
        contractAmountSnapshot: contractAmount,
        billedPercentBefore: billedPercent,
        submittedByUserId: userId,
        salesManagerUserId: dto.salesManagerUserId,
        financeReviewUserId: dto.financeReviewUserId,
        costControlApproverUserId: dto.costControlApproverUserId,
        generalManagerUserId: dto.generalManagerUserId,
        accountingUserId: dto.accountingUserId,
      },
    });

    await this.lineNotifier.notifyByUser(
      dto.salesManagerUserId,
      `📄 有新的請款單待你簽核（${STAGE_LABEL.salesManager}）：${dto.vendorName} ${dto.amount.toLocaleString('en-US')}。`,
    );
    return created;
  }

  /** 給 payment-requests/:id/stages/:stage/decide 用——跨專案，權限靠這一
   * 關的 approverUserId 本人，不用另外查 project 存取權。 */
  async decideStage(userId: string, paymentRequestId: string, stage: PaymentRequestStage, dto: DecidePaymentRequestStageDto) {
    if (dto.action === 'REJECT' && !dto.comment?.trim()) {
      throw new BadRequestException('退回必須填寫原因');
    }

    const request = await this.prisma.paymentRequest.findUnique({ where: { id: paymentRequestId } });
    if (!request) throw new NotFoundException('Payment request not found');
    if (request.overallStatus !== DocumentApprovalStatus.PENDING) {
      throw new BadRequestException('這筆請款單已經結束了');
    }
    if (request[userIdField(stage)] !== userId) {
      throw new ForbiddenException('這一關不是指派給你的');
    }
    if (request[statusField(stage)] !== DocumentApprovalStatus.PENDING) {
      throw new BadRequestException('這一關已經處理過了');
    }
    this.assertCurrentStage(request, stage);

    const status = dto.action === 'APPROVE' ? DocumentApprovalStatus.APPROVED : DocumentApprovalStatus.REJECTED;
    const isLastStage = stage === STAGE_ORDER[STAGE_ORDER.length - 1];
    const overallStatus =
      dto.action === 'REJECT'
        ? DocumentApprovalStatus.REJECTED
        : isLastStage
          ? DocumentApprovalStatus.APPROVED
          : DocumentApprovalStatus.PENDING;

    await this.prisma.paymentRequest.update({
      where: { id: paymentRequestId },
      data: {
        [statusField(stage)]: status,
        [`${stage}Comment`]: dto.comment ?? null,
        [`${stage}DecidedAt`]: new Date(),
        overallStatus,
      },
    });

    if (dto.action === 'REJECT') {
      await this.lineNotifier.notifyByUser(
        request.submittedByUserId,
        `❌ 請款單「${request.vendorName} ${request.amount.toLocaleString('en-US')}」在${STAGE_LABEL[stage]}這關被退回：${dto.comment}`,
      );
    } else if (isLastStage) {
      await this.lineNotifier.notifyByUser(
        request.submittedByUserId,
        `✅ 請款單「${request.vendorName} ${request.amount.toLocaleString('en-US')}」已全部核准。`,
      );
    } else {
      const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1];
      await this.lineNotifier.notifyByUser(
        request[userIdField(nextStage)] as string,
        `📄 輪到你簽核請款單（${STAGE_LABEL[nextStage]}）：${request.vendorName} ${request.amount.toLocaleString('en-US')}。`,
      );
    }

    return this.prisma.paymentRequest.findUniqueOrThrow({ where: { id: paymentRequestId } });
  }

  /** Cross-project — every stage currently awaiting this user's action. */
  async pendingForMe(userId: string) {
    const candidates = await this.prisma.paymentRequest.findMany({
      where: {
        overallStatus: DocumentApprovalStatus.PENDING,
        OR: STAGE_ORDER.map((stage) => ({
          [userIdField(stage)]: userId,
          [statusField(stage)]: DocumentApprovalStatus.PENDING,
        })),
      },
      include: { costControlRow: { include: { project: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const result: Array<{
      paymentRequestId: string;
      stage: PaymentRequestStage;
      stageLabel: string;
      vendorName: string;
      amount: number;
      projectId: string;
      projectName: string;
      submittedByUserId: string;
      createdAt: Date;
    }> = [];
    for (const request of candidates) {
      for (const stage of STAGE_ORDER) {
        if (request[userIdField(stage)] !== userId) continue;
        if (request[statusField(stage)] !== DocumentApprovalStatus.PENDING) continue;
        if (!this.isCurrentStage(request, stage)) continue;
        result.push({
          paymentRequestId: request.id,
          stage,
          stageLabel: STAGE_LABEL[stage],
          vendorName: request.vendorName,
          amount: request.amount,
          projectId: request.costControlRow.projectId,
          projectName: request.costControlRow.project.name,
          submittedByUserId: request.submittedByUserId,
          createdAt: request.createdAt,
        });
      }
    }
    return result;
  }

  private assertCurrentStage(request: PaymentRequest, stage: PaymentRequestStage): void {
    if (!this.isCurrentStage(request, stage)) {
      throw new BadRequestException('還沒輪到這一關');
    }
  }

  private isCurrentStage(request: PaymentRequest, stage: PaymentRequestStage): boolean {
    const index = STAGE_ORDER.indexOf(stage);
    for (let i = 0; i < index; i++) {
      if (request[statusField(STAGE_ORDER[i])] !== DocumentApprovalStatus.APPROVED) return false;
    }
    return true;
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getRequestOrThrow(projectId: string, paymentRequestId: string) {
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: paymentRequestId },
      include: { costControlRow: true },
    });
    if (!request || request.costControlRow.projectId !== projectId) {
      throw new NotFoundException('Payment request not found');
    }
    return request;
  }
}
