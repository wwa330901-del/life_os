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
  const service = new FinancePlanService(prisma as never, {} as never, {} as never, recurring as never, {} as never, {} as never);
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
