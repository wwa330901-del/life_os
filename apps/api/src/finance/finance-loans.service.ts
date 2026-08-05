import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { UsersService } from '../users/users.service';
import { FinanceLoanDirection, FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceLoanDto } from './dto/create-finance-loan.dto';
import { CreateFinanceLoanRepaymentDto } from './dto/create-finance-loan-repayment.dto';
import { UpdateFinanceLoanDto } from './dto/update-finance-loan.dto';
import { UpdateFinanceLoanRepaymentDto } from './dto/update-finance-loan-repayment.dto';

const loanInclude = {
  initialTransaction: true,
  repayments: { include: { transaction: true }, orderBy: { createdAt: 'asc' as const } },
  inviteSent: { include: { toUser: { select: { id: true, name: true, email: true } } } },
};

/** 跟人借錢/借錢給人 — see the `FinanceLoan` schema doc comment for why this
 * is a separate model/service from `FinanceAdvancesService` despite the
 * near-identical mechanic. Every loan's initial cash move and every
 * repayment against it is a real `FinanceTransaction` (so account balances
 * stay correct) using `LOAN_OUT`/`LOAN_IN` — a type excluded from every
 * income/expense aggregation by construction (those all allowlist
 * INCOME/EXPENSE), not by a special case added here. */
@Injectable()
export class FinanceLoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FinanceAccessService,
    private readonly usersService: UsersService,
  ) {}

  /** Cursor-paginated (30/page), optionally filtered by `settled` — filtering
   * at the query level (backed by the real `settled` column, not the
   * in-memory `withOutstanding` computation) is what makes this safe to
   * paginate at all: an old unsettled loan must always land on page 1 of
   * the "未結清" view regardless of `createdAt`, which it wouldn't if
   * pagination were applied to the unfiltered list and settled/unsettled
   * were sorted out client-side after the fact. */
  async list(
    userId: string,
    spaceId: string,
    filter: { cursor?: string; settled?: boolean } = {},
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const take = 30;
    const rows = await this.prisma.financeLoan.findMany({
      where: { spaceId, ...(filter.settled !== undefined && { settled: filter.settled }) },
      include: loanInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map((loan) => this.withOutstanding(loan)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async create(userId: string, spaceId: string, dto: CreateFinanceLoanDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);

    const type =
      dto.direction === FinanceLoanDirection.LEND
        ? FinanceTransactionType.LOAN_OUT
        : FinanceTransactionType.LOAN_IN;

    const loan = await this.prisma.financeLoan.create({
      data: {
        spaceId,
        direction: dto.direction,
        counterpartyName: dto.counterpartyName,
        initialTransaction: {
          create: {
            spaceId,
            type,
            amount: dto.amount,
            accountId: dto.accountId,
            date: new Date(dto.date),
            note: dto.note,
          },
        },
      },
      include: loanInclude,
    });
    await this.syncSettled(loan.id, loan);
    return this.withOutstanding(loan);
  }

  async addRepayment(
    userId: string,
    spaceId: string,
    loanId: string,
    dto: CreateFinanceLoanRepaymentDto,
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.assertAccount(spaceId, dto.accountId);
    const loan = await this.getOrThrow(spaceId, loanId);

    const outstanding = this.outstandingOf(loan);
    if (dto.amount > outstanding + 0.001) {
      throw new BadRequestException(
        `這筆借貸只剩 ${outstanding} 元還沒結清，還款金額不能超過這個數字`,
      );
    }

    // LEND (我借出去的) settles by money coming back in (LOAN_IN);
    // BORROW (我借入的) settles by money going back out (LOAN_OUT).
    const type =
      loan.direction === FinanceLoanDirection.LEND
        ? FinanceTransactionType.LOAN_IN
        : FinanceTransactionType.LOAN_OUT;

    await this.prisma.financeLoanRepayment.create({
      data: {
        loanId,
        transaction: {
          create: {
            spaceId,
            type,
            amount: dto.amount,
            accountId: dto.accountId,
            date: new Date(dto.date),
            note: dto.note,
          },
        },
      },
    });

    const updated = await this.getOrThrow(spaceId, loanId);
    await this.syncSettled(loanId, updated);
    return this.withOutstanding(updated);
  }

  /** `direction` is deliberately not editable here — it decides which way
   * every repayment's `type` was recorded (LOAN_IN vs LOAN_OUT), so
   * changing it after any repayment exists would desync past repayments
   * from what the new direction implies. `counterpartyName` lives on
   * `FinanceLoan` itself; amount/account/date/note all live on the linked
   * `initialTransaction` (see the schema doc comment — this row is the
   * single source of truth for those, not duplicated here). */
  async update(userId: string, spaceId: string, loanId: string, dto: UpdateFinanceLoanDto) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const loan = await this.getOrThrow(spaceId, loanId);
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);

    if (dto.counterpartyName !== undefined) {
      await this.prisma.financeLoan.update({
        where: { id: loanId },
        data: { counterpartyName: dto.counterpartyName },
      });
    }

    if (dto.amount !== undefined || dto.accountId !== undefined || dto.date !== undefined || dto.note !== undefined) {
      if (dto.amount !== undefined) {
        const repaid = loan.repayments.reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
        if (dto.amount < repaid - 0.001) {
          throw new BadRequestException(`本金不能低於已還款的 ${repaid} 元`);
        }
      }
      await this.prisma.financeTransaction.update({
        where: { id: loan.initialTransaction!.id },
        data: {
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.date !== undefined && { date: new Date(dto.date) }),
          ...(dto.note !== undefined && { note: dto.note }),
        },
      });
    }

    const updatedAmount = await this.getOrThrow(spaceId, loanId);
    await this.syncSettled(loanId, updatedAmount);
    return this.withOutstanding(updatedAmount);
  }

  async updateRepayment(
    userId: string,
    spaceId: string,
    loanId: string,
    repaymentId: string,
    dto: UpdateFinanceLoanRepaymentDto,
  ) {
    await this.access.assertPersonalSpace(userId, spaceId);
    if (dto.accountId) await this.assertAccount(spaceId, dto.accountId);
    const loan = await this.getOrThrow(spaceId, loanId);
    const repayment = loan.repayments.find((r) => r.id === repaymentId);
    if (!repayment?.transaction) {
      throw new NotFoundException('還款紀錄不存在');
    }

    if (dto.amount !== undefined) {
      const principal = loan.initialTransaction?.amount ?? 0;
      const otherRepaid = loan.repayments
        .filter((r) => r.id !== repaymentId)
        .reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
      if (otherRepaid + dto.amount > principal + 0.001) {
        throw new BadRequestException(`還款總額不能超過本金 ${principal} 元`);
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

    const updatedRepayment = await this.getOrThrow(spaceId, loanId);
    await this.syncSettled(loanId, updatedRepayment);
    return this.withOutstanding(updatedRepayment);
  }

  /** 借出/借入互通 — invite another platform user (by email) to confirm this
   * loan involves them, so their side gets a matching record once THEY
   * accept (never unilaterally, see the schema doc comment on
   * `FinanceLoanInvite`). One invite per loan (`fromLoanId` is unique). */
  async inviteConfirmation(userId: string, spaceId: string, loanId: string, email: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, loanId);

    const target = await this.usersService.findByEmail(email);
    if (!target) throw new NotFoundException('找不到這個 email 對應的帳號');
    if (target.id === userId) throw new BadRequestException('不能邀請自己');

    const existing = await this.prisma.financeLoanInvite.findUnique({ where: { fromLoanId: loanId } });
    if (existing) throw new BadRequestException('這筆借貸已經邀請過對方確認了');

    return this.prisma.financeLoanInvite.create({
      data: { fromLoanId: loanId, fromUserId: userId, toUserId: target.id },
      include: { toUser: { select: { id: true, name: true, email: true } } },
    });
  }

  /** 我收到的邀請（含已接受的，方便回顧）。 */
  async listReceivedInvites(userId: string) {
    return this.prisma.financeLoanInvite.findMany({
      where: { toUserId: userId },
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        fromLoan: { include: loanInclude },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 接受邀請——在自己的個人空間自動建立一筆方向相反的對應借貸（LEND↔
   * BORROW），金額/日期/備註照抄對方那筆的 initialTransaction，帳戶用自己
   * 排序第一個帳戶（跟 LINE 借貸指令同一套簡化邏輯，沒有更好的預設可選）。
   * 只在接受當下建立一次，之後兩筆各自獨立，不會持續同步（見 schema doc
   * comment）。 */
  async acceptInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.financeLoanInvite.findUnique({
      where: { id: inviteId },
      include: { fromLoan: { include: loanInclude }, fromUser: { select: { id: true, name: true } } },
    });
    if (!invite || invite.toUserId !== userId) {
      throw new ForbiddenException('這不是你收到的邀請');
    }
    if (invite.accepted) {
      throw new BadRequestException('已經接受過這筆邀請了');
    }

    const mySpace = await this.prisma.space.findUnique({ where: { ownerUserId: userId } });
    if (!mySpace) throw new BadRequestException('找不到你的個人空間');

    const account = await this.prisma.financeAccount.findFirst({
      where: { spaceId: mySpace.id },
      orderBy: { sortOrder: 'asc' },
    });
    if (!account) {
      throw new BadRequestException('你還沒有任何記帳帳戶，請先到記帳的「帳戶」分頁新增一個再接受邀請');
    }

    const sourceLoan = invite.fromLoan;
    const mirroredDirection =
      sourceLoan.direction === FinanceLoanDirection.LEND ? FinanceLoanDirection.BORROW : FinanceLoanDirection.LEND;
    const mirroredType =
      mirroredDirection === FinanceLoanDirection.LEND ? FinanceTransactionType.LOAN_OUT : FinanceTransactionType.LOAN_IN;

    const mirroredLoan = await this.prisma.financeLoan.create({
      data: {
        spaceId: mySpace.id,
        direction: mirroredDirection,
        counterpartyName: invite.fromUser.name,
        initialTransaction: {
          create: {
            spaceId: mySpace.id,
            type: mirroredType,
            amount: sourceLoan.initialTransaction!.amount,
            accountId: account.id,
            date: sourceLoan.initialTransaction!.date,
            note: sourceLoan.initialTransaction!.note,
          },
        },
      },
      include: loanInclude,
    });

    await this.prisma.financeLoanInvite.update({
      where: { id: inviteId },
      data: { accepted: true, createdLoanId: mirroredLoan.id },
    });
    await this.syncSettled(mirroredLoan.id, mirroredLoan);

    return this.withOutstanding(mirroredLoan);
  }

  /** 拒絕（或撤銷還沒被接受的邀請）——直接刪除，不留痕跡，跟共用行事曆的
   * 邀請機制同一套設計。已經接受過的邀請不能再撤銷（兩邊的借貸紀錄已經
   * 各自獨立存在，撤銷邀請本身不會、也不該把已建立的紀錄拿掉）。 */
  async removeInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.financeLoanInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('找不到這筆邀請');
    if (invite.fromUserId !== userId && invite.toUserId !== userId) {
      throw new ForbiddenException('這不是你的借貸邀請');
    }
    if (invite.accepted) {
      throw new BadRequestException('已經接受過的邀請不能撤銷');
    }
    await this.prisma.financeLoanInvite.delete({ where: { id: inviteId } });
  }

  async remove(userId: string, spaceId: string, loanId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    await this.getOrThrow(spaceId, loanId);
    await this.prisma.financeLoan.delete({ where: { id: loanId } });
  }

  private async getOrThrow(spaceId: string, loanId: string) {
    const loan = await this.prisma.financeLoan.findUnique({
      where: { id: loanId },
      include: loanInclude,
    });
    if (!loan || loan.spaceId !== spaceId) {
      throw new NotFoundException('Finance loan not found');
    }
    return loan;
  }

  private async assertAccount(spaceId: string, accountId: string) {
    const account = await this.prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!account || account.spaceId !== spaceId) {
      throw new BadRequestException('帳戶不存在');
    }
  }

  private outstandingOf(loan: {
    initialTransaction: { amount: number } | null;
    repayments: { transaction: { amount: number } | null }[];
  }): number {
    const principal = loan.initialTransaction?.amount ?? 0;
    const repaid = loan.repayments.reduce((sum, r) => sum + (r.transaction?.amount ?? 0), 0);
    return Math.max(0, principal - repaid);
  }

  private withOutstanding<
    T extends {
      initialTransaction: { amount: number } | null;
      repayments: { transaction: { amount: number } | null }[];
    },
  >(loan: T) {
    const outstanding = this.outstandingOf(loan);
    return { ...loan, outstanding, settled: outstanding <= 0 };
  }

  /** Persists the real `settled` column so `list()` can filter on it at the
   * query level (see `list`'s doc comment) — called after every write that
   * can change a loan's outstanding balance. */
  private async syncSettled(
    loanId: string,
    loan: {
      initialTransaction: { amount: number } | null;
      repayments: { transaction: { amount: number } | null }[];
    },
  ) {
    await this.prisma.financeLoan.update({
      where: { id: loanId },
      data: { settled: this.outstandingOf(loan) <= 0 },
    });
  }
}
