import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'app_harness.dart';
import 'fake_backend.dart';

FakeBackend _brainBackend() => loggedInBackend()
  ..on('GET /knowledge/categories/public', [])
  ..on('GET /knowledge/categories', [])
  ..on('GET /knowledge/brain/overview', {
    'total': 3,
    'topicCount': 2,
    'events': [
      {'id': 'i1', 'title': '奈良美智特展', 'startDate': '2026-11-01', 'endDate': '2026-12-06', 'daysLeft': 9, 'started': true},
    ],
    'unread': [
      {'id': 'i2', 'title': '巷弄咖啡', 'sourcePlatform': '圖片', 'createdAt': '2026-11-25T02:00:00.000Z'},
    ],
    'unreadCount': 1,
    'topTopics': [
      {'id': 't1', 'name': '台南', 'count': 3},
      {'id': 't2', 'name': '咖啡', 'count': 1},
    ],
  })
  ..on('GET /knowledge/brain/graph', {
    'topics': [
      {'id': 't1', 'name': '台南', 'count': 3},
      {'id': 't2', 'name': '咖啡', 'count': 1},
    ],
    'items': [
      {'id': 'i1', 'title': '奈良美智特展', 'read': true, 'eventEndDate': '2026-12-06'},
      {'id': 'i2', 'title': '巷弄咖啡', 'read': false, 'eventEndDate': null},
      {'id': 'i3', 'title': '牛肉湯', 'read': true, 'eventEndDate': null},
    ],
    'edges': [
      {'from': 'i1', 'to': 't1', 'kind': 'topic'},
      {'from': 'i2', 'to': 't1', 'kind': 'topic'},
      {'from': 'i2', 'to': 't2', 'kind': 'topic'},
      {'from': 'i3', 'to': 't1', 'kind': 'topic'},
      {'from': 'i2', 'to': 'i1', 'kind': 'item'},
    ],
  })
  ..on('GET /knowledge/items/i2', {
    'id': 'i2',
    'ownerUserId': 'u1',
    'status': 'DONE',
    'title': '巷弄咖啡',
    'summary': '美術館旁的老屋咖啡，手沖很好喝。',
    'tags': ['咖啡'],
    'fieldValues': [],
    'sourcePlatform': '網頁文章',
    'sourceUrl': 'https://example.com/cafe',
    'rawContent': '這是整篇文章的原文內容。',
    'readAt': null,
    'createdAt': '2026-11-25T02:00:00.000Z',
  })
  ..on('GET /knowledge/brain/items/i2/connections', {
    'topics': [
      {'id': 't1', 'name': '台南', 'count': 3},
    ],
    'related': [
      {'id': 'i1', 'title': '奈良美智特展', 'reason': '走路 5 分鐘'},
    ],
  })
  ..on('POST /knowledge/brain/items/i2/read', {'read': true})
  ..on('GET /knowledge/brain/topics/t1', {
    'id': 't1',
    'name': '台南',
    'items': [
      {'id': 'i1', 'title': '奈良美智特展', 'summary': null, 'readAt': '2026-11-20T00:00:00.000Z'},
    ],
  });

void main() {
  testWidgets('大腦：首頁看到展覽和還沒看的 → 打開一則先看分析、自動標看過 → 看原文', (tester) async {
    final backend = _brainBackend();
    await pumpApp(tester, backend, token: 't1');

    await tester.tap(find.text('知識庫'));
    await tester.pumpAndSettle();

    expect(find.text('我的大腦'), findsOneWidget);
    expect(find.text('還剩 9 天 · 12/6 結束'), findsOneWidget);
    expect(find.text('還沒看的（1）'), findsOneWidget);
    expect(find.text('大腦地圖'), findsOneWidget);

    await tester.tap(find.text('巷弄咖啡').first);
    await tester.pumpAndSettle();
    expect(find.text('AI 分析'), findsOneWidget);
    expect(find.text('美術館旁的老屋咖啡，手沖很好喝。'), findsOneWidget);
    expect(find.text('走路 5 分鐘'), findsOneWidget);
    expect(backend.sent('POST /knowledge/brain/items/i2/read').last, {'read': true});

    await tester.tap(find.text('看原文'));
    await tester.pumpAndSettle();
    expect(find.text('這是整篇文章的原文內容。'), findsOneWidget);
    expect(find.text('打開連結'), findsOneWidget);
  });

  testWidgets('大腦：點主題看到裡面的收藏', (tester) async {
    final backend = _brainBackend();
    await pumpApp(tester, backend, token: 't1');
    await tester.tap(find.text('知識庫'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('台南 3'));
    await tester.pumpAndSettle();
    expect(find.text('台南（1 則）'), findsOneWidget);
    expect(find.text('奈良美智特展'), findsWidgets);
  });

  testWidgets('大腦：窄螢幕三顆切換，地圖畫得出來', (tester) async {
    final backend = _brainBackend();
    await pumpApp(tester, backend, token: 't1');
    // pumpApp 會把畫面設成 1400 寬，之後再縮成平板直立的寬度。
    tester.view.physicalSize = const Size(700, 1000);
    await tester.pumpAndSettle();
    await tester.tap(find.text('知識庫'));
    await tester.pumpAndSettle();

    expect(find.text('現在'), findsOneWidget);
    await tester.tap(find.text('地圖'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('整張圖放進畫面'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
