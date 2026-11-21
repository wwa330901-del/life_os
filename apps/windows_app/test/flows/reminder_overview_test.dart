import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

void main() {
  testWidgets('提醒設定 → 看接下來 14 天會提醒什麼', (tester) async {
    final backend = loggedInBackend()
      ..on('GET /line/settings', {'linked': true, 'morningBriefEnabled': true})
      ..on('GET /reminders/upcoming', [
        {'date': '2026-11-24', 'time': '15:00', 'kind': 'todo', 'title': '打電話給房東'},
        {'date': '2026-11-25', 'time': null, 'kind': 'card', 'title': '國泰卡 繳款日'},
      ]);
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('提醒設定'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('看接下來 14 天會提醒什麼'));
    await tester.pumpAndSettle();

    expect(find.text('打電話給房東'), findsOneWidget);
    expect(find.text('15:00'), findsOneWidget);
    expect(find.text('國泰卡 繳款日'), findsOneWidget);
  });
}
