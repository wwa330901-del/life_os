import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { SupabaseStorageService } from '../knowledge/supabase-storage.service';
import { CostControlService } from './cost-control.service';
import { DocumentApprovalsService } from '../document-approvals/document-approvals.service';
import type { PaymentRequestPeriod } from '../../generated/prisma/client.js';
import { CreatePaymentRequestPeriodDto } from './dto/create-payment-request-period.dto';
import { AddAdditionalChargeDto } from './dto/add-additional-charge.dto';
import { SubmitFixedRoleApprovalDto } from './dto/submit-fixed-role-approval.dto';

/**
 * 工程請款單——每一「期」是一筆 PaymentRequestPeriod，對應唯一一列③執行中
 * 成控表（一個發包）。廠商收款資訊在建立時從該列決標廠商自動快照（Vendor
 * 主檔之後被編輯不影響已送出的請款單）。期數自由新增，不是固定五期。追加
 * 款只能透過 addAdditionalCharge 這個原子動作設定（金額＋附件一起送），
 * 設定時自動在該列產生 side=VENDOR 的追加減（CostControlService）。鎖定
 * 粒度是「這一期」，不是整張請款單——每期各自獨立走完六關簽核。
 */
@Injectable()
export class PaymentRequestPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly storage: SupabaseStorageService,
    private readonly costControlService: CostControlService,
    private readonly documentApprovals: DocumentApprovalsService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const periods = await this.prisma.paymentRequestPeriod.findMany({
      where: { costControlRow: { projectId } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(periods.map((p) => this.withComputedFields(p)));
  }

  async getOne(userId: string, projectId: string, periodId: string) {
    await this.getAuthorizedProject(userId, projectId);
    const period = await this.getPeriodOrThrow(projectId, periodId);
    return this.withComputedFields(period);
  }

  async create(
    userId: string,
    projectId: string,
    dto: CreatePaymentRequestPeriodDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);

    const row = await this.prisma.costControlRow.findUnique({
      where: { id: dto.costControlRowId },
      include: {
        procurementComparison: {
          include: { selectedVendorQuote: { include: { vendor: true } } },
        },
      },
    });
    if (!row || row.projectId !== projectId) {
      throw new BadRequestException('成控列不存在或不屬於這個專案');
    }
    const vendor = row.procurementComparison?.selectedVendorQuote?.vendor;
    if (!vendor) {
      throw new BadRequestException('這一列還沒有決標，無法建立請款單');
    }

    const { contractAmount, billedPercent } =
      await this.costControlService.getContractSnapshot(row.id);

    const created = await this.prisma.paymentRequestPeriod.create({
      data: {
        costControlRowId: row.id,
        periodLabel: dto.periodLabel,
        amount: dto.amount,
        requestDate: new Date(dto.requestDate),
        note: dto.note,
        vendorNameSnapshot: vendor.name,
        vendorBankAccountSnapshot: vendor.bankAccount,
        vendorAccountHolderSnapshot: vendor.accountHolder,
        vendorBankBranchSnapshot: vendor.bankBranch,
        contractAmountSnapshot: contractAmount,
        billedPercentBefore: billedPercent,
        submittedByUserId: userId,
      },
    });
    return this.withComputedFields(created);
  }

  /** 追加款——金額跟「追加報價單」附件一起原子送出，缺一不可（這是使用者
   * 明確要求的規則），落地同時在對應成控列產生一筆 side=VENDOR 的追加減。 */
  async addAdditionalCharge(
    userId: string,
    projectId: string,
    periodId: string,
    dto: AddAdditionalChargeDto,
    file: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('填了追加款金額就必須附上追加報價單');
    if (!this.storage.configured)
      throw new BadRequestException('檔案儲存服務尚未設定');
    await this.getAuthorizedProject(userId, projectId);
    const period = await this.getEditablePeriodOrThrow(projectId, periodId);

    const extension = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'bin';
    const path = `payment-request-periods/${periodId}/additional-quotation.${extension}`;
    await this.storage.upload(
      path,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );

    await this.prisma.paymentRequestPeriod.update({
      where: { id: periodId },
      data: {
        additionalAmount: dto.amount,
        additionalQuotationAttachmentPath: path,
      },
    });
    await this.costControlService.recordVendorAdjustment(
      period.costControlRowId,
      dto.amount,
      `請款單「${period.periodLabel}」追加款`,
    );

    return this.withComputedFields(
      await this.prisma.paymentRequestPeriod.findUniqueOrThrow({
        where: { id: periodId },
      }),
    );
  }

  async submit(
    userId: string,
    projectId: string,
    periodId: string,
    dto: SubmitFixedRoleApprovalDto,
  ) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getPeriodOrThrow(projectId, periodId);
    await this.documentApprovals.submitPaymentRequestPeriod(
      userId,
      periodId,
      dto.approverUserIds,
    );
    return this.getOne(userId, projectId, periodId);
  }

  async history(userId: string, projectId: string, periodId: string) {
    await this.getAuthorizedProject(userId, projectId);
    await this.getPeriodOrThrow(projectId, periodId);
    return this.documentApprovals.historyForTarget({
      type: 'PAYMENT_REQUEST_PERIOD',
      id: periodId,
    });
  }

  private async withComputedFields(period: PaymentRequestPeriod) {
    const locked = await this.documentApprovals.isLockedForTarget({
      type: 'PAYMENT_REQUEST_PERIOD',
      id: period.id,
    });
    const additionalQuotationAttachmentUrl =
      period.additionalQuotationAttachmentPath
        ? await this.storage.getSignedUrl(
            period.additionalQuotationAttachmentPath,
          )
        : null;
    return { ...period, locked, additionalQuotationAttachmentUrl };
  }

  private async getAuthorizedProject(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
    return project;
  }

  private async getPeriodOrThrow(
    projectId: string,
    periodId: string,
  ): Promise<PaymentRequestPeriod> {
    const period = await this.prisma.paymentRequestPeriod.findUnique({
      where: { id: periodId },
      include: { costControlRow: true },
    });
    if (!period || period.costControlRow.projectId !== projectId) {
      throw new NotFoundException('Payment request period not found');
    }
    return period;
  }

  private async getEditablePeriodOrThrow(
    projectId: string,
    periodId: string,
  ): Promise<PaymentRequestPeriod> {
    const period = await this.getPeriodOrThrow(projectId, periodId);
    const locked = await this.documentApprovals.isLockedForTarget({
      type: 'PAYMENT_REQUEST_PERIOD',
      id: periodId,
    });
    if (locked) {
      throw new BadRequestException('這一期請款單已經簽核鎖定，不能再編輯');
    }
    return period;
  }
}
