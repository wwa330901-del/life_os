import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StocksAccessService } from './stocks-access.service';

/** 股票帳戶（2026-10-07）：股票買賣通常都走同一個證券交割帳戶，設一次之後
 * App 新增交易/定期定額預設選它，LINE「買股」和 AI 記股票沒講帳戶就用它。 */
@Injectable()
export class StocksSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StocksAccessService,
  ) {}

  async get(userId: string, spaceId: string) {
    await this.access.assertPersonalSpace(userId, spaceId);
    const account = await this.stockAccount(spaceId);
    return { accountId: account?.id ?? null, accountName: account?.name ?? null };
  }

  async setAccount(userId: string, spaceId: string, accountId: string | null) {
    await this.access.assertPersonalSpace(userId, spaceId);
    if (accountId) {
      const account = await this.prisma.financeAccount.findUnique({ where: { id: accountId } });
      if (!account || account.spaceId !== spaceId) throw new BadRequestException('帳戶不存在');
    }
    await this.prisma.space.update({ where: { id: spaceId }, data: { stockAccountId: accountId } });
    return this.get(userId, spaceId);
  }

  /** 設定的股票帳戶；沒設或帳戶已被刪掉回 null。 */
  async stockAccount(spaceId: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { stockAccountId: true } });
    if (!space?.stockAccountId) return null;
    return this.prisma.financeAccount.findFirst({ where: { id: space.stockAccountId, spaceId } });
  }
}
