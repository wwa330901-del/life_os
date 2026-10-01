import { DivinationFeedbackService } from './divination-feedback.service';

const NOW = new Date('2026-10-10T11:30:00Z');

function record(id: string, ownerUserId: string, daysAgo: number) {
  return {
    id,
    ownerUserId,
    question: `問題${id}`,
    hexagram: '天火同人',
    interpretation: '1. 小吉，面試有機會上\n2. 卦象…',
    castAt: new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000),
  };
}

describe('DivinationFeedbackService.askForFeedback', () => {
  it('asks each person about their oldest unanswered reading, once', async () => {
    const prisma = {
      divinationRecord: {
        // The query already filters to unanswered 7–30-day-old readings, oldest first.
        findMany: jest.fn().mockResolvedValue([record('a', 'u1', 12), record('b', 'u1', 8), record('c', 'u2', 7)]),
        update: jest.fn(),
      },
      lineAccountLink: { update: jest.fn() },
    };
    const lineNotifier = { notifyByUser: jest.fn() };
    await new DivinationFeedbackService(prisma as never, lineNotifier as never).askForFeedback(NOW);

    expect(lineNotifier.notifyByUser).toHaveBeenCalledTimes(2);
    const [userId, text] = lineNotifier.notifyByUser.mock.calls[0] as [string, string];
    expect(userId).toBe('u1');
    expect(text).toContain('12 天前你算了「問題a」（天火同人）');
    expect(text).toContain('當時說：小吉，面試有機會上');
    expect(prisma.divinationRecord.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { feedbackAskedAt: NOW } });
    expect(prisma.lineAccountLink.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { divinationFeedbackId: 'a', divinationFeedbackAt: NOW },
    });
    expect(prisma.divinationRecord.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b' } }));
  });
});
