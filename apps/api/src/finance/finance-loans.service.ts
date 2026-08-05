import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceLoanDirection, FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceLoanDto } from './dto/create-finance-loan.dto';
import { CreateFinanceLoanRepaymentDto } from './dto/create-finance-loan-repayment.dto';
import { UpdateFinanceLoanDto } from './dto/update-finance-loan.dto';
import { UpdateFinanceLoanRepaymentDto } from './dto/update-finance-loan-repayment.dto';

const loanInclude = {
  initialTransaction: true,
  repayments: { include: { transaction: true }, orderBy: { createdAt: 'asc' as const } },
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
  ) {}

  async list(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const loans = await this.prisma.financeLoan.findMany({
      where: { spaceId },
      include: loanInclude,
      orderBy: { createdAt: 'desc' },
    });
    return loans.map((loan) => this.withOutstanding(loan));
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

    return this.withOutstanding(await this.getOrThrow(spaceId, loanId));
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

    return this.withOutstanding(await this.getOrThrow(spaceId, loanId));
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
}
