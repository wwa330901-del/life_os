import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

void main() {
  testWidgets('讀取失敗（500）：中文說明＋英文詳細＋複製給 Claude', (tester) async {
    final backend = loggedInBackend()..fail('GET /todos');
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('代辦事項'));
    await tester.pumpAndSettle();

    expect(find.text('這裡暫時打不開'), findsOneWidget);
    expect(find.text('已經自動通知管理員在修了，你不用做什麼'), findsOneWidget);
    expect(find.textContaining('GET /todos -> 500'), findsOneWidget);
    expect(find.text('複製給 Claude'), findsOneWidget);
  });

  testWidgets('斷網：說「連不上伺服器」，英文詳細寫出原始錯誤', (tester) async {
    final backend = loggedInBackend()..offline('GET /todos');
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('代辦事項'));
    await tester.pumpAndSettle();

    expect(find.text('連不上伺服器'), findsOneWidget);
    expect(find.textContaining('ClientException'), findsOneWidget);
  });
}
