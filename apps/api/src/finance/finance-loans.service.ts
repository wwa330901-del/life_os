import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { FinanceLoanDirection, FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceLoanDto } from './dto/create-finance-loan.dto';
import { CreateFinanceLoanRepaymentDto } from './dto/create-finance-loan-repayment.dto';

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
