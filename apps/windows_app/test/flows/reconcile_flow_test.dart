import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

const _base = '/spaces/sp1/finance';

void main() {
  testWidgets('平帳：帳戶 → 平帳 → 填實際金額 → 看到差多少 → 送出', (tester) async {
    final backend = loggedInBackend()
      ..on('GET $_base/accounts', [
        {'id': 'a1', 'name': '現金', 'type': 'CASH', 'initialBalance': 7000, 'balance': 7000, 'sortOrder': 0},
      ])
      ..onCall('POST $_base/accounts/a1/reconcile', (body) {
        final actual = (body['actualBalance'] as num).toDouble();
        if (body['previewOnly'] == true) {
          return {
            'bookBalance': 7000,
            'actualBalance': actual,
            'plan': {'difference': actual - 7000, 'type': 'EXPENSE', 'amount': 7000 - actual, 'categoryName': '忘記記帳'},
          };
        }
        return {'id': 'r1'};
      });
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('我的空間'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, '帳戶'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, '平帳'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, '現在實際有多少'), '5000');
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pumpAndSettle();
    expect(find.textContaining('少了 2,000，會記一筆「忘記記帳」支出 2,000'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, '平帳'));
    await tester.pumpAndSettle();

    final sent = backend.sent('POST $_base/accounts/a1/reconcile');
    expect(sent.last, {'actualBalance': 5000.0});
    expect(find.text('「現金」平帳好了'), findsOneWidget);
  });

  testWidgets('首頁統計：預算進度、健檢分數、每月固定的扣款狀態', (tester) async {
    final backend = loggedInBackend()
      ..on('GET /home/layout', [
        {'type': 'budgetProgress', 'visible': true},
        {'type': 'financialHealth', 'visible': true},
        {'type': 'recurringStatus', 'visible': true},
      ]);
    final dashboard = Map<String, dynamic>.from(backend.response('GET /home/dashboard') as Map)
      ..addAll({
        'budgetProgress': {
          'month': '2026-11',
          'items': [
            {'categoryName': '交通', 'budget': 2000, 'spent': 1900},
          ],
        },
        'financialHealth': {
          'score': 72,
          'grade': '還不錯',
          'netWorth': 130000,
          'trend': [
            {'date': '2026-10-01', 'netWorth': 120000},
            {'date': '2026-11-01', 'netWorth': 130000},
          ],
        },
        'recurringStatus': {
          'items': [
            {
              'label': '薪水',
              'type': 'INCOME',
              'amount': 52000,
              'accountName': '郵局',
              'firedThisMonth': true,
              'thisMonthDate': '2026-11-05',
              'nextDate': '2026-12-05',
            },
          ],
          'recentReconciliations': [
            {'date': '2026-11-20', 'accountName': '現金', 'difference': -1820},
          ],
        },
      });
    backend.on('GET /home/dashboard', dashboard);
    await pumpApp(tester, backend, token: 't1');

    expect(find.text('1,900 / 2,000'), findsOneWidget);
    expect(find.text('72'), findsOneWidget);
    expect(find.text('✓ 11/5 已自動記帳'), findsOneWidget);
    expect(find.text('下次 12/5'), findsOneWidget);
    expect(find.text('11/20・現金・忘記記 1,820'), findsOneWidget);
  });
}
