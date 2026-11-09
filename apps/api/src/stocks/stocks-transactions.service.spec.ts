import { StocksTransactionsService } from './stocks-transactions.service';
import { StockTransactionType } from '../../generated/prisma/client.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function setup() {
  const prisma = {
    financeAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'a1', spaceId: 's1' }) },
    stockTransaction: {
      create: jest.fn((args: { data: Record<string, unknown> }) => args.data),
      delete: jest.fn().mockReturnValue('delete-stock'),
      findUnique: jest.fn(),
    },
    financeTransaction: {
      create: jest.fn((args: { data: Record<string, unknown> }) => args.data),
      deleteMany: jest.fn().mockReturnValue('delete-finance'),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  };
  const access = { assertPersonalSpace: jest.fn().mockResolvedValue(undefined) };
  const holdings = { recompute: jest.fn().mockResolvedValue(undefined) };
  const settlement = { financeEntry: jest.fn().mockResolvedValue({ spaceId: 's1', amount: 1000, date: 'x' }) };
  const service = new StocksTransactionsService(prisma as never, access as never, holdings as never, settlement as never);
  return { service, prisma, holdings, settlement };
}

const dto = (tradeDate: string, backfill?: boolean) => ({
  stockCode: '0050',
  type: StockTransactionType.BUY,
  pricePerShare: 100,
  shares: 10,
  tradeDate,
  accountId: 'a1',
  ...(backfill !== undefined && { backfill }),
});

describe('股票補登記', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date('2026-11-09T02:00:00Z') })); // 11/9（一）台北 10:00
  afterEach(() => jest.useRealTimers());

  it('一般新增維持 T+2，不動帳戶', async () => {
    const { service, prisma } = setup();
    await service.create('u1', 's1', dto('2026-11-09'));
    expect(prisma.stockTransaction.create.mock.calls[0][0].data).toMatchObject({ settlementDate: d('2026-11-11') });
    expect(prisma.stockTransaction.create.mock.calls[0][0].data.settled).toBeUndefined();
    expect(prisma.financeTransaction.create).not.toHaveBeenCalled();
  });

  it('舊交易：立刻交割，收支記在實際的 T+2 那天，兩邊互相連結', async () => {
    const { service, prisma, settlement, holdings } = setup();
    await service.create('u1', 's1', dto('2026-10-01', true));
    const stock = prisma.stockTransaction.create.mock.calls[0][0].data as { settled: boolean; settlementDate: Date; backfillFinanceTransactionId: string };
    const finance = prisma.financeTransaction.create.mock.calls[0][0].data;
    expect(stock.settled).toBe(true);
    expect(stock.settlementDate).toEqual(settlement.financeEntry.mock.calls[0][1]);
    expect(stock.settlementDate.getTime()).toBeLessThan(d('2026-11-09').getTime());
    expect(stock.backfillFinanceTransactionId).toBe(finance.id);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(holdings.recompute).toHaveBeenCalledWith('s1', '0050');
  });

  it('今天成交的補登記，T+2 還沒到也今天就交割', async () => {
    const { service, prisma } = setup();
    await service.create('u1', 's1', dto('2026-11-09', true));
    expect(prisma.stockTransaction.create.mock.calls[0][0].data).toMatchObject({ settled: true, settlementDate: d('2026-11-09') });
  });

  it('未來的日期不能補登記', async () => {
    const { service, prisma } = setup();
    await expect(service.create('u1', 's1', dto('2026-11-10', true))).rejects.toThrow('補登記');
    expect(prisma.stockTransaction.create).not.toHaveBeenCalled();
  });

  it('補登記可以刪，收支一起刪', async () => {
    const { service, prisma } = setup();
    prisma.stockTransaction.findUnique.mockResolvedValue({
      id: 't1', spaceId: 's1', stockCode: '0050', settled: true, pending: false, backfillFinanceTransactionId: 'f1',
    });
    await service.remove('u1', 's1', 't1');
    expect(prisma.financeTransaction.deleteMany).toHaveBeenCalledWith({ where: { id: 'f1', spaceId: 's1' } });
    expect(prisma.$transaction).toHaveBeenCalledWith(['delete-finance', 'delete-stock']);
  });

  it('一般已交割的還是不能刪', async () => {
    const { service, prisma } = setup();
    prisma.stockTransaction.findUnique.mockResolvedValue({
      id: 't1', spaceId: 's1', stockCode: '0050', settled: true, pending: false, backfillFinanceTransactionId: null,
    });
    await expect(service.remove('u1', 's1', 't1')).rejects.toThrow('不能刪除');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
