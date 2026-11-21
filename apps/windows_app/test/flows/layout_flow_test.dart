import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

FakeBackend _withLayout(String layout) =>
    loggedInBackend()..on('GET /auth/me', {...testUser, 'appLayout': layout});

void main() {
  testWidgets('A 功能卡片：點卡片進功能，「回首頁」回來', (tester) async {
    final backend = loggedInBackend()..on('GET /todos', {'personal': []});
    await pumpApp(tester, backend, token: 't1');

    expect(find.text('股票'), findsOneWidget);
    expect(find.text('我的空間'), findsNothing);
    await tester.tap(find.text('代辦事項'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('回首頁'));
    await tester.pumpAndSettle();
    expect(find.text('首頁總覽'), findsOneWidget);
  });

  testWidgets('B 左邊選單：選單一直在，記帳一頁＋更多功能', (tester) async {
    final backend = _withLayout('sidebar')
      ..on('GET /spaces/sp1/finance/accounts', [
        {'id': 'a1', 'name': '現金', 'type': 'CASH', 'initialBalance': 7000, 'balance': 6820, 'sortOrder': 0},
      ])
      ..on('GET /spaces/sp1/finance/categories', [])
      ..on('GET /spaces/sp1/finance/transactions', []);
    await pumpApp(tester, backend, token: 't1');

    expect(find.text('今天'), findsWidgets);
    await tester.tap(find.text('記帳'));
    await tester.pumpAndSettle();
    expect(find.text('6,820'), findsOneWidget);
    await tester.tap(find.text('更多功能'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilledButton, '平帳'), findsNothing);
    expect(find.text('借貸'), findsOneWidget);
    expect(find.text('退休試算'), findsOneWidget);
  });

  testWidgets('C AI 優先：首頁輸入框打字 → 直接到 AI 問答並送出', (tester) async {
    final backend = _withLayout('ai')
      ..onCall('POST /ai-assistant/ask', (body) => {'answer': '晚餐 150 記在現金可以嗎？', 'interactionId': 'x1'});
    await pumpApp(tester, backend, token: 't1');

    await tester.enterText(find.byType(TextField).first, '晚餐 150');
    await tester.tap(find.widgetWithText(FilledButton, '送出'));
    await tester.pumpAndSettle();

    expect(backend.sent('POST /ai-assistant/ask').single, {'question': '晚餐 150'});
    expect(find.text('晚餐 150 記在現金可以嗎？'), findsOneWidget);
  });

  testWidgets('版面設定：選「左邊選單」馬上換，並存到伺服器', (tester) async {
    final backend = loggedInBackend()..onCall('PATCH /auth/me', (body) => {...testUser, ...body});
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('版面設定'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('左邊選單'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('好了'));
    await tester.pumpAndSettle();

    expect(backend.sent('PATCH /auth/me').single, {'appLayout': 'sidebar'});
    expect(find.text('其他'), findsOneWidget);
  });
}
