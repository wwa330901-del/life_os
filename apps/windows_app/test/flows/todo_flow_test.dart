import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

Map<String, dynamic> _todo(String id, String title, {bool ongoing = false, String? due}) => {
  'id': id,
  'title': title,
  'done': false,
  'completedAt': null,
  'dueDate': due,
  'dueDateAllDay': true,
  'isOngoing': ongoing,
  'priority': 'MEDIUM',
  'notes': null,
  'sortOrder': 0,
  'calendarSyncTarget': null,
};

void main() {
  testWidgets('代辦：首頁點「代辦事項」→ 新增持續性任務 → 送出並出現在清單', (tester) async {
    final todos = [_todo('t1', '繳房租', due: '2026-11-21')];
    final backend = loggedInBackend()
      ..onCall('GET /todos', (_) => {'personal': todos})
      ..onCall('POST /todos', (body) {
        todos.add(_todo('t2', body['title'] as String, ongoing: body['isOngoing'] as bool));
        return todos.last;
      });
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('代辦事項'));
    await tester.pumpAndSettle();
    expect(find.text('繳房租'), findsOneWidget);

    await tester.tap(find.text('新增個人事項'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '項目'), '整理衣櫃');
    await tester.tap(find.text('持續性任務'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, '儲存'));
    await tester.pumpAndSettle();

    final sent = backend.sent('POST /todos').single;
    expect(sent['title'], '整理衣櫃');
    expect(sent['isOngoing'], true);
    expect(sent.containsKey('dueDate'), false);
    expect(find.text('整理衣櫃'), findsOneWidget);
    expect(backend.unknown, isEmpty);
  });
}
