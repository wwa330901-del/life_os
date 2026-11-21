import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:life_os_app/core/token_storage.dart';

/// App 主要流程測試用的假後端：照「方法 路徑」回事先準備好的 JSON，
/// 並記下 App 打了哪些請求（含送出的內容），測試可以檢查。
class FakeBackend {
  FakeBackend();

  /// 'GET /spaces/me' → 回傳內容（可以是函式，拿到請求內容再決定）。
  final Map<String, Object? Function(Map<String, dynamic> body)> _routes = {};
  final List<({String method, String path, Map<String, dynamic> body})> requests = [];
  final Set<String> unknown = {};

  void on(String route, Object? response) => _routes[route] = (_) => response;
  void onCall(String route, Object? Function(Map<String, dynamic> body) handler) => _routes[route] = handler;

  /// 讓某個路由回 4xx 錯誤＋後端的中文訊息。
  void onError(String route, int status, String message) => _routes[route] = (_) => _ClientError(status, message);

  /// 讓某個路由回 500（測系統出問題時 App 顯示中文）。
  void fail(String route) => _routes[route] = (_) => const _ServerError();

  List<Map<String, dynamic>> sent(String route) => [
    for (final r in requests)
      if ('${r.method} ${r.path}' == route) r.body,
  ];

  http.Client get client => MockClient((request) async {
    final path = request.url.path;
    final body = request.body.isEmpty ? <String, dynamic>{} : (jsonDecode(request.body) as Map<String, dynamic>);
    requests.add((method: request.method, path: path, body: body));
    final route = '${request.method} $path';
    final handler = _routes[route];
    if (handler == null) {
      unknown.add(route);
      return http.Response(jsonEncode({'message': '測試沒準備：$route'}), 404, headers: _json);
    }
    final result = handler(body);
    if (result is _ServerError) return http.Response('<html>oops</html>', 500);
    if (result is _ClientError) return http.Response(jsonEncode({'message': result.message}), result.status, headers: _json);
    return http.Response(jsonEncode(result), 200, headers: _json);
  });

  static const _json = {'content-type': 'application/json; charset=utf-8'};
}

class _ClientError {
  const _ClientError(this.status, this.message);

  final int status;
  final String message;
}

class _ServerError {
  const _ServerError();
}

class MemoryTokenStorage implements TokenStorage {
  MemoryTokenStorage([this.token]);

  String? token;

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String token) async => this.token = token;

  @override
  Future<void> clear() async => token = null;
}

const testUser = {
  'id': 'u1',
  'username': 'hugo',
  'email': 'hugo@example.com',
  'name': '小明',
  'isPlatformAdmin': false,
  'appTheme': null,
};

/// 已登入、首頁有資料的假後端（各流程測試從這裡開始，再加自己要的路由）。
FakeBackend loggedInBackend() => FakeBackend()
  ..on('GET /auth/me', testUser)
  ..on('POST /auth/me/location', {})
  ..on('GET /spaces/me', [
    {'id': 'sp1', 'type': 'PERSONAL', 'name': '我的空間'},
  ])
  ..on('GET /home/layout', [
    {'type': 'personalFinance', 'visible': true},
    {'type': 'todayTodos', 'visible': true},
  ])
  ..on('GET /home/dashboard', {
    'personalFinance': {
      'accounts': [
        {'id': 'a1', 'name': '現金', 'type': 'CASH', 'balance': 6820},
      ],
      'todayIncome': 0,
      'todayExpense': 180,
    },
    'todosToday': {
      'completedToday': [],
      'dueTodayIncomplete': [
        {'id': 't1', 'title': '繳房租'},
      ],
    },
    'stockSummary': null,
    'ongoingTodos': [],
    'lifeGoals': [],
    'recentKnowledgeItems': [],
  });
