import { FinancePlanService } from './finance-plan.service';

function makeService(existingSalary: boolean) {
  const prisma = {
    space: { findUnique: jest.fn().mockResolvedValue({ id: 'personal' }) },
    financeAccount: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'cash', name: '現金', type: 'CASH' },
        { id: 'bank', name: '國泰世華', type: 'BANK' },
      ]),
    },
    financeCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'salary', name: '薪水' }]) },
    financeRecurringTransaction: {
      findMany: jest.fn().mockResolvedValue(
        existingSalary ? [{ id: 'r1', categoryId: 'salary', category: { name: '薪水' } }] : [],
      ),
    },
  };
  const recurring = {
    create: jest.fn((_u, _s, dto) => Promise.resolve({ amount: dto.amount, dayOfMonth: dto.dayOfMonth })),
    update: jest.fn((_u, _s, _id, dto) => Promise.resolve({ amount: dto.amount, dayOfMonth: dto.dayOfMonth })),
  };
  const service = new FinancePlanService(prisma as never, {} as never, {} as never, recurring as never, {} as never, {} as never, {} as never, {} as never);
  return { service, recurring };
}

describe('FinancePlanService.setFixedIncome', () => {
  it('creates a monthly salary into the bank account when none exists', async () => {
    const { service, recurring } = makeService(false);
    const out = await service.setFixedIncome('u1', { amount: 50000, dayOfMonth: 5 });
    expect(recurring.create).toHaveBeenCalledWith('u1', 'personal', {
      type: 'INCOME',
      note: '固定薪資',
      amount: 50000,
      dayOfMonth: 5,
      accountId: 'bank',
      categoryId: 'salary',
    });
    expect(out).toEqual({ amount: 50000, dayOfMonth: 5, account: '國泰世華', category: '薪水', updated: false });
  });

  it('updates the existing salary instead of adding a second one', async () => {
    const { service, recurring } = makeService(true);
    const out = await service.setFixedIncome('u1', { amount: 55000, dayOfMonth: 10 });
    expect(recurring.update).toHaveBeenCalledWith('u1', 'personal', 'r1', expect.objectContaining({ amount: 55000, dayOfMonth: 10 }));
    expect(recurring.create).not.toHaveBeenCalled();
    expect(out.updated).toBe(true);
  });

  it('rejects an invalid payday', async () => {
    const { service } = makeService(false);
    await expect(service.setFixedIncome('u1', { amount: 50000, dayOfMonth: 40 })).rejects.toThrow('發薪日');
  });
});

describe('FinancePlanService.applyBudgets', () => {
  it('keeps the saved plan in sync when a budget is changed from LINE', async () => {
    const plan = {
      budgets: [
        { category: '餐飲', amount: 9000, reason: '外食多', currentAverage: 11000 },
        { category: '娛樂', amount: 3000, reason: '', currentAverage: 4000 },
      ],
    };
    const prisma = {
      space: {
        findUnique: jest.fn().mockResolvedValue({ id: 'personal' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ financePlan: plan }),
        update: jest.fn(),
      },
      financeCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'food', name: '餐飲' },
          { id: 'fun', name: '娛樂' },
          { id: 'car', name: '交通' },
        ]),
      },
    };
    const budgets = { upsert: jest.fn() };
    const service = new FinancePlanService(prisma as never, {} as never, budgets as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    const out = await service.applyBudgets('u1', [
      { categoryName: '餐飲', monthlyAmount: 8000 },
      { categoryName: '娛樂', monthlyAmount: 3000 },
      { categoryName: '交通', monthlyAmount: 2500 },
    ]);

    expect(out).toEqual(['餐飲 8,000', '娛樂 3,000', '交通 2,500']);
    expect(budgets.upsert).toHaveBeenCalledWith('u1', 'personal', { categoryId: 'food', monthlyAmount: 8000 });
    const saved = prisma.space.update.mock.calls[0][0].data.financePlan.budgets;
    expect(saved).toEqual([
      { category: '餐飲', amount: 8000, reason: '你自己調整的金額', currentAverage: 11000 },
      { category: '娛樂', amount: 3000, reason: '', currentAverage: 4000 },
      { category: '交通', amount: 2500, reason: '你自己加的', currentAverage: null },
    ]);
  });
});
