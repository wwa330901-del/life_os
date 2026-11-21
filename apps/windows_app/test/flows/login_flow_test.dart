import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

void main() {
  testWidgets('登入：打帳號密碼 → 進到首頁看到名字和今天的代辦', (tester) async {
    final backend = loggedInBackend()..on('POST /auth/login', {'accessToken': 't1', 'user': testUser});
    await pumpApp(tester, backend);

    await tester.enterText(find.widgetWithText(TextFormField, '帳號'), 'hugo');
    await tester.enterText(find.widgetWithText(TextFormField, '密碼'), 'secret1');
    await tester.tap(find.widgetWithText(FilledButton, '登入'));
    await tester.pumpAndSettle();

    expect(backend.sent('POST /auth/login').single, {'username': 'hugo', 'password': 'secret1'});
    expect(find.textContaining('，小明'), findsOneWidget);
    expect(find.textContaining('繳房租'), findsWidgets);
    expect(backend.unknown, isEmpty);
  });

  testWidgets('登入：帳號密碼錯 → 顯示後端給的中文原因，留在登入畫面', (tester) async {
    final backend = FakeBackend()..onError('POST /auth/login', 401, '帳號或密碼錯誤');
    await pumpApp(tester, backend);

    await tester.enterText(find.widgetWithText(TextFormField, '帳號'), 'hugo');
    await tester.enterText(find.widgetWithText(TextFormField, '密碼'), 'wrong');
    await tester.tap(find.widgetWithText(FilledButton, '登入'));
    await tester.pumpAndSettle();

    expect(find.text('帳號或密碼錯誤'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, '登入'), findsOneWidget);
  });

  testWidgets('系統出問題（伺服器 500）→ 只顯示「已通知管理員」的中文，不露英文錯誤', (tester) async {
    final backend = FakeBackend()..fail('POST /auth/login');
    await pumpApp(tester, backend);

    await tester.enterText(find.widgetWithText(TextFormField, '帳號'), 'hugo');
    await tester.enterText(find.widgetWithText(TextFormField, '密碼'), 'secret1');
    await tester.tap(find.widgetWithText(FilledButton, '登入'));
    await tester.pumpAndSettle();

    expect(find.textContaining('已經通知管理員'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });
}
