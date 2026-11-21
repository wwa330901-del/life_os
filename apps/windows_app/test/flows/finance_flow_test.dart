import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

const _base = '/spaces/sp1/finance';

Map<String, dynamic> _category(String id, String name, String kind) => {
  'id': id,
  'name': name,
  'kind': kind,
  'sortOrder': 0,
  'parentId': null,
};

void main() {
  testWidgets('記帳：進「我的空間」→ 交易 → 新增一筆支出 → 送出並出現在清單', (tester) async {
    final transactions = <Map<String, dynamic>>[];
    final backend = loggedInBackend()
      ..on('GET $_base/accounts', [
        {
          'id': 'a1',
          'name': '現金',
          'type': 'CASH',
          'initialBalance': 7000,
          'balance': 7000,
          'sortOrder': 0,
        },
      ])
      ..on('GET $_base/categories', [
        _category('c1', '餐飲', 'EXPENSE'),
        _category('c2', '薪資', 'INCOME'),
      ])
      ..onCall('GET $_base/transactions', (_) => transactions)
      ..onCall('POST $_base/transactions', (body) {
        transactions.add({...body, 'id': 'tx${transactions.length + 1}', 'toAccountId': null, 'note': body['note']});
        return transactions.last;
      });
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('我的空間'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Tab, '交易'));
    await tester.pumpAndSettle();
    expect(find.text('這個月還沒有任何交易'), findsOneWidget);

    await tester.tap(find.text('新增交易'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '金額'), '180');
    await tester.tap(find.widgetWithText(DropdownButtonFormField<String>, '分類'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('餐飲').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '備註（選填）'), '拉麵');
    await tester.tap(find.widgetWithText(FilledButton, '儲存'));
    await tester.pumpAndSettle();

    final sent = backend.sent('POST $_base/transactions').single;
    expect(sent['type'], 'EXPENSE');
    expect(sent['amount'], 180);
    expect(sent['accountId'], 'a1');
    expect(sent['categoryId'], 'c1');
    expect(sent['note'], '拉麵');
    expect(find.textContaining('拉麵'), findsWidgets);
  });
}
