import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { ProjectsService } from '../projects/projects.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceAdvanceDto } from './dto/create-finance-advance.dto';
import { CreateFinanceAdvanceRepaymentDto } from './dto/create-finance-advance-repayment.dto';
import { UpdateFinanceAdvanceDto } from './dto/update-finance-advance.dto';
import { UpdateFinanceAdvanceRepaymentDto } from './dto/update-finance-advance-repayment.dto';

const advanceInclude = {
  initialTransaction: true,
  repayments: { include: { transaction: true }, orderBy: { createdAt: 'asc' as const } },
  project: true,
};

/** 工作上先幫忙出錢，之後公司/專案還你 — see the `FinanceAdvance` schema doc
 * comment for why this is a separate model/service from
 * `FinanceLoansService` despite the near-identical mechanic. Unlike a
 * personal loan there's no direction: the initial move is always
 * `ADVANCE_OUT`, every repayment is always `ADVANCE_IN`. */
@Injectable()
export class FinanceAdvancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Cursor-paginated (30/page), optionally filtered by `projectId`/`settled`
   * — see `FinanceLoansService.list`'s doc comment for why `settled` filters
   * at the query level against a persisted column rather than being sorted
   * out client-side after an unfiltered page load. `from`/`to` (both
   * inclusive) filter by the advance's `initialTransaction.date` — used by
   * the App's date/week/month history search. */
  async list(
    userId: string,
    spaceId: string,
    filter: { projectId?: string; cursor?: string; settled?: boolean; from?: Date; to?: Date } = {},
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const take = 30;
    const rows = await this.prisma.financeAdvance.findMany({
      where: {
        spaceId,
        ...(filter.projectId && { projectId: filter.projectId }),
        ...(filter.settled !== undefined && { settled: filter.settled }),
        ...((filter.from || filter.to) && {
          initialTransaction: {
            date: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) },
          },
        }),
      },
      include: advanceInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((advance) => this.withOutstanding(advance)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceAdvanceDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);
    if (dto.projectId) {
      await this.assertProjectAccess(userId, dto.projectId);
    }

    const advance = await this.prisma.financeAdvance.create({
      data: {
        spaceId,
        title: dto.title,
        projectId: dto.projectId,
        initialTransaction: {
          create: {
            spaceId,
            type: FinanceTransactionType.ADVANCE_OUT,
            amount: dto.amount,
            accountId: dto.accountId,
            date: new Date(dto.date),
            note: dto.note,
          },
        },
      },
      include: advanceInclude,
    });
    await this.syncSettled(advance.id, advance);
    return this.withOutstanding(advance);
  }

  async addRepayment(
    userId: string,
    spaceId: string,
    advanceId: string,
    dto: CreateFinanceAdvanceRepaymentDto,
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);
    const advance = await this.getOrThrow(spaceId, advanceId);

    const outstanding = this.outstandingOf(advance);
    if (dto.amount > outstanding + 0.001) {
      throw new BadRequestException(
        `這筆代墊只剩 ${outstanding} 元還沒收回，收回金額不能超過這個數字`,
      );
    }

    await this.prisma.financeAdvanceRepayment.create({
      data: {
        advanceId,
        transaction: {
          create: {
            spaceId,
            type: FinanceTransactionType.ADVANCE_IN,
            amount: dto.amount,
            accountId: dto.accountId,
            date: new Date(dto.date),
            note: dto.note,
          },
        },
      },
    });

    const updated = await this.getOrThrow(spaceId, advanceId);
    await this.syncSettled(advanceId, updated);
    return this.withOutstanding(updated);
  }

  /** `title`/`projectId` live on `FinanceAdvance` itself; amount/account/
   * date/note all live on the linked `initialTransaction` (same "single
   * source of truth on the transaction row" convention as
   * `FinanceLoansService.update`). */
  async update(userId: string, spaceId: string, advanceId: string, dto: UpdateFinanceAdvanceDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const advance = await this.getOrThrow(spaceId, advanceId);
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);
    if (dto.projectId) await this.assertProjectAccess(userId, dto.projectId);

    if (dto.title !== undefined || dto.projectId !== undefined || dto.clearProjectId) {
      await this.prisma.financeAdvance.update({
        where: { id: advanceId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.clearProjectId ? { projectId: null } : dto.projectId !== undefined && { projectId: dto.projectId }),
        },
      });
    }

    if (dto.amount !== undefined || dto.accountId !== undefined || dto.date !== undefined || dto.note !== undefined) {
      if (dto.amount !== undefined) {
        const repaid = advance.repayments.reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
        if (dto.amount < repaid - 0.001) {
          throw new BadRequestException(`金額不能低於已收回的 ${repaid} 元`);
        }
      }
      await this.prisma.financeTransaction.update({
        where: { id: advance.initialTransaction!.id },
        data: {
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.date !== undefined && { date: new Date(dto.date) }),
          ...(dto.note !== undefined && { note: dto.note }),
        },
      });
    }

    const updatedAmount = await this.getOrThrow(spaceId, advanceId);
    await this.syncSettled(advanceId, updatedAmount);
    return this.withOutstanding(updatedAmount);
  }

  async updateRepayment(
    userId: string,
    spaceId: string,
    advanceId: string,
    repaymentId: string,
    dto: UpdateFinanceAdvanceRepaymentDto,
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);
    const advance = await this.getOrThrow(spaceId, advanceId);
    const repayment = advance.repayments.find((r) => r.id === repaymentId);
    if (!repayment?.transaction) {
      throw new NotFoundException('收回紀錄不存在');
    }

    if (dto.amount !== undefined) {
      const principal = advance.initialTransaction?.amount ?? 0;
      const otherRepaid = advance.repayments
        .filter((r) => r.id !== repaymentId)
        .reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
      if (otherRepaid + dto.amount > principal + 0.001) {
        throw new BadRequestException(`收回總額不能超過金額 ${principal} 元`);
      }
    }

    await this.prisma.financeTransaction.update({
      where: { id: repayment.transaction.id },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.accountId !== undefined && { accountId: dto.accountId }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    });

    const updatedRepayment = await this.getOrThrow(spaceId, advanceId);
    await this.syncSettled(advanceId, updatedRepayment);
    return this.withOutstanding(updatedRepayment);
  }

  async remove(userId: string, spaceId: string, advanceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, advanceId);
    await this.prisma.financeAdvance.delete({ where: { id: advanceId } });
  }

  private async getOrThrow(spaceId: string, advanceId: string) {
    const advance = await this.prisma.financeAdvance.findUnique({
      where: { id: advanceId },
      include: advanceInclude,
    });
    if (!advance || advance.spaceId !== spaceId) {
      throw new NotFoundException('Finance advance not found');
    }
    return advance;
  }

  private async assertAccount(spaceId: string, accountId: string) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!account || account.spaceId !== spaceId) {
      throw new BadRequestException('帳戶不存在');
    }
  }

  private async assertProjectAccess(userId: string, projectId: string) {
    const project = await this.projectsService.getProjectOrThrow(projectId);
    await this.projectsService.assertAccess(userId, project);
  }

  private outstandingOf(advance: {
    initialTransaction: { amount: number } | null;
    repayments: { transaction: { amount: number } | null }[];
  }): number {
    const principal = advance.initialTransaction?.amount ?? 0;
    const repaid = advance.repayments.reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
    return Math.max(0, principal - repaid);
  }

  private withOutstanding<
    T extends {
      initialTransaction: { amount: number } | null;
      repayments: { transaction: { amount: number } | null }[];
    },
  >(advance: T) {
    const outstanding = this.outstandingOf(advance);
    return { ...advance, outstanding, settled: outstanding <= 0 };
  }

  /** Persists the real `settled` column so `list()` can filter on it at the
   * query level (see `list`'s doc comment) — called after every write that
   * can change an advance's outstanding balance. */
  private async syncSettled(
    advanceId: string,
    advance: {
      initialTransaction: { amount: number } | null;
      repayments: { transaction: { amount: number } | null }[];
    },
  ) {
    await this.prisma.financeAdvance.update({
      where: { id: advanceId },
      data: { settled: this.outstandingOf(advance) <= 0 },
    });
  }
}
