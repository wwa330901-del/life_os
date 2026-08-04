import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAccessService } from './finance-access.service';
import { ProjectsService } from '../projects/projects.service';
import { FinanceTransactionType } from '../../generated/prisma/client.js';
import { CreateFinanceAdvanceDto } from './dto/create-finance-advance.dto';
import { CreateFinanceAdvanceRepaymentDto } from './dto/create-finance-advance-repayment.dto';

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

  async list(userId: string, spaceId: string, projectId?: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const advances = await this.prisma.financeAdvance.findMany({
      where: { spaceId, ...(projectId && { projectId }) },
      include: advanceInclude,
      orderBy: { createdAt: 'desc' },
    });
    return advances.map((advance) => this.withOutstanding(advance));
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
    return this.withOutstanding(updated);
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
}
