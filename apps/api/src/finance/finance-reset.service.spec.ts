import { FinanceResetService } from './finance-reset.service';

function makeService() {
  const model = () => ({
    deleteMany: jest.fn().mockReturnValue('deleteMany'),
    updateMany: jest.fn().mockReturnValue('updateMany'),
    update: jest.fn().mockReturnValue('update'),
    createMany: jest.fn().mockReturnValue('createMany'),
  });
  const prisma = {
    financeLoan: model(),
    financeAdvance: model(),
    financeTransaction: model(),
    stockTransaction: model(),
    stockHolding: {
      ...model(),
      findMany: jest.fn().mockResolvedValue([{ stockCode: '0050', shares: 1000, costBasis: 150000 }]),
    },
    stockOpeningPosition: model(),
    financeNetWorthSnapshot: model(),
    financeAlertLog: model(),
    space: model(),
    financeRecurringTransaction: model(),
    stockRecurringInvestment: model(),
    financeAccount: model(),
    financeBudget: model(),
    financeCategory: model(),
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const access = { assertPersonalSpace: jest.fn().mockResolvedValue({}) };
  const accounts = {
    list: jest.fn().mockResolvedValue([
      { id: 'cash', balance: 1200 },
      { id: 'bank', balance: -300 },
    ]),
  };
  const service = new FinanceResetService(prisma as never, access as never, accounts as never);
  return { service, prisma };
}

describe('FinanceResetService.reset', () => {
  it('keeps accounts and sets their balance to what the user typed (or the current balance)', async () => {
    const { service, prisma } = makeService();
    await service.reset('u1', 's1', { confirm: '清空', deleteSetup: false, balances: [{ accountId: 'bank', balance: 5000 }] });
    expect(prisma.financeTransaction.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 's1' } });
    expect(prisma.stockHolding.deleteMany).toHaveBeenCalled();
    expect(prisma.financeLoan.deleteMany).toHaveBeenCalled();
    expect(prisma.financeAdvance.deleteMany).toHaveBeenCalled();
    expect(prisma.financeAccount.deleteMany).not.toHaveBeenCalled();
    expect(prisma.financeCategory.deleteMany).not.toHaveBeenCalled();
    expect(prisma.financeAccount.update).toHaveBeenCalledWith({
      where: { id: 'cash' },
      data: { initialBalance: 1200, cardReminderKey: null },
    });
    expect(prisma.financeAccount.update).toHaveBeenCalledWith({
      where: { id: 'bank' },
      data: { initialBalance: 5000, cardReminderKey: null },
    });
    // 現在的持股變成期初持股，持股快取原樣放回。
    expect(prisma.stockOpeningPosition.createMany).toHaveBeenCalledWith({
      data: [{ spaceId: 's1', stockCode: '0050', shares: 1000, totalCost: 150000 }],
    });
    expect(prisma.stockHolding.createMany).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('deletes accounts, categories, budgets and recurring entries when asked', async () => {
    const { service, prisma } = makeService();
    await service.reset('u1', 's1', { confirm: '清空', deleteSetup: true });
    expect(prisma.financeAccount.deleteMany).toHaveBeenCalledWith({ where: { spaceId: 's1' } });
    expect(prisma.financeCategory.deleteMany).toHaveBeenCalled();
    expect(prisma.financeBudget.deleteMany).toHaveBeenCalled();
    expect(prisma.financeRecurringTransaction.deleteMany).toHaveBeenCalled();
    expect(prisma.financeAccount.update).not.toHaveBeenCalled();
    expect(prisma.stockOpeningPosition.deleteMany).toHaveBeenCalled();
    expect(prisma.stockOpeningPosition.createMany).not.toHaveBeenCalled();
  });
});
