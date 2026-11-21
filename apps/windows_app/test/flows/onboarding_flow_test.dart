import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

void main() {
  testWidgets('新手引導：新帳號 → 建帳戶 → 跳過 LINE → 完成 → 進首頁', (tester) async {
    var n = 0;
    final backend = loggedInBackend()
      ..on('GET /auth/me', {...testUser, 'onboarded': false})
      ..onCall('POST /spaces/sp1/finance/accounts', (_) => {'id': 'a${++n}'})
      ..on('POST /auth/me/onboarded', {'onboarded': true});
    await pumpApp(tester, backend, token: 't1');

    expect(find.text('歡迎，小明！'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, '現在有多少').first, '5000');
    await tester.tap(find.byType(Checkbox).at(2)); // 也有信用卡
    await tester.pump();
    await tester.enterText(find.widgetWithText(TextField, '現在欠多少'), '1200');
    await tester.tap(find.text('下一步'));
    await tester.pumpAndSettle();

    final created = backend.sent('POST /spaces/sp1/finance/accounts');
    expect(created, [
      {'name': '現金', 'type': 'CASH', 'initialBalance': 5000.0},
      {'name': '信用卡', 'type': 'CREDIT_CARD', 'initialBalance': -1200.0},
    ]);

    expect(find.text('連結 LINE，用講的就能記帳'), findsOneWidget);
    await tester.tap(find.text('先跳過'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('完成，開始使用'));
    await tester.pumpAndSettle();

    expect(backend.sent('POST /auth/me/onboarded'), hasLength(1));
    expect(find.text('首頁總覽'), findsOneWidget);
  });

  testWidgets('新手引導：金額亂打 → 那一格下面紅字，不送出', (tester) async {
    final backend = loggedInBackend()..on('GET /auth/me', {...testUser, 'onboarded': false});
    await pumpApp(tester, backend, token: 't1');

    await tester.enterText(find.widgetWithText(TextField, '現在有多少').first, '五千');
    await tester.tap(find.text('下一步'));
    await tester.pumpAndSettle();

    expect(find.text('只能打數字，例如 5000'), findsOneWidget);
    expect(backend.sent('POST /spaces/sp1/finance/accounts'), isEmpty);
  });
}
