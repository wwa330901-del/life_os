import 'package:flutter_test/flutter_test.dart';
import 'package:life_os_app/core/models/life_goal.dart';

void main() {
  group('LifeGoal.fromJson', () {
    test('numeric goal computes clamped progress', () {
      final goal = LifeGoal.fromJson({
        'id': 'g1',
        'title': '存到 15 萬',
        'targetValue': 150000,
        'currentValue': 45000,
        'unit': '元',
        'targetDate': '2026-12-31T00:00:00.000Z',
        'status': 'ACTIVE',
      });
      expect(goal.progress, closeTo(0.3, 1e-9));
      expect(goal.targetDate, DateTime(2026, 12, 31));
      expect(goal.status, LifeGoalStatus.active);

      expect(lifeGoalProgress(10, 25), 1.0);
      // 體重 75 → 70, now 73: 40%, not 104%.
      expect(lifeGoalProgress(70, 73, 75), closeTo(0.4, 1e-9));
    });

    test('goal without a target number has no progress', () {
      final goal = LifeGoal.fromJson({
        'id': 'g2',
        'title': '學會放鬆、不焦慮',
        'currentValue': 0,
        'status': 'COMPLETED',
        'completedAt': '2026-09-29T10:00:00.000Z',
      });
      expect(goal.progress, isNull);
      expect(goal.targetDate, isNull);
      expect(goal.status, LifeGoalStatus.completed);
    });
  });

  test('formatGoalNumber', () {
    expect(formatGoalNumber(150000), '150,000');
    expect(formatGoalNumber(12), '12');
    expect(formatGoalNumber(3.5), '3.5');
  });

  test('check-in goal parses tracking fields', () {
    final goal = LifeGoal.fromJson({
      'id': 'g3',
      'title': '每週運動 3 次',
      'targetValue': 3,
      'currentValue': 2,
      'unit': '次',
      'status': 'ACTIVE',
      'trackingType': 'CHECK_IN',
      'checkInPeriod': 'WEEKLY',
      'requireCheckInNote': false,
    });
    expect(goal.trackingType, LifeGoalTrackingType.checkIn);
    expect(goal.checkInPeriod, LifeGoalPeriod.weekly);
    expect(goal.trackingDescription, '打卡・本週');
    expect(goal.progress, closeTo(2 / 3, 1e-9));
  });

  test('LifeGoalInput always sends tracking type and period', () {
    final json = const LifeGoalInput(
      title: '體重',
      notes: null,
      category: '健康',
      targetValue: 70,
      currentValue: 75,
      startValue: 75,
      unit: '公斤',
      targetDate: null,
      trackingType: LifeGoalTrackingType.manual,
      trackingAccountId: null,
      trackingKeyword: null,
      checkInPeriod: LifeGoalPeriod.total,
      requireCheckInNote: false,
    ).toJson();
    expect(json['trackingType'], 'MANUAL');
    expect(json['checkInPeriod'], 'TOTAL');
    expect(json.containsKey('targetDate'), isTrue);
  });
}
