import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

Future<void> _openAi(WidgetTester tester) async {
  await tester.tap(find.text('AI 問答'));
  await tester.pumpAndSettle();
}

Future<void> _say(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField).last, text);
  await tester.tap(find.byTooltip('送出'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('AI 問答：說一句話 → 看到回覆，第二句接著同一段對話', (tester) async {
    var n = 0;
    final backend = loggedInBackend()
      ..onCall('POST /ai-assistant/ask', (body) {
        n++;
        return {'answer': n == 1 ? '晚餐 150 元，記在現金可以嗎？' : '好，記好了。', 'interactionId': 'turn-$n'};
      });
    await pumpApp(tester, backend, token: 't1');
    await _openAi(tester);

    await _say(tester, '晚餐 150');
    expect(find.text('晚餐 150'), findsOneWidget);
    expect(find.text('晚餐 150 元，記在現金可以嗎？'), findsOneWidget);

    await _say(tester, '對');
    expect(find.text('好，記好了。'), findsOneWidget);

    final sent = backend.sent('POST /ai-assistant/ask');
    expect(sent[0], {'question': '晚餐 150'});
    expect(sent[1], {'question': '對', 'previousInteractionId': 'turn-1'});
    expect(backend.unknown, isEmpty);
  });

  testWidgets('AI 問答：系統出問題 → 對話裡顯示「已通知管理員」，不露英文錯誤', (tester) async {
    final backend = loggedInBackend()..fail('POST /ai-assistant/ask');
    await pumpApp(tester, backend, token: 't1');
    await _openAi(tester);

    await _say(tester, '你好');
    expect(find.textContaining('已經通知管理員'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });
}
