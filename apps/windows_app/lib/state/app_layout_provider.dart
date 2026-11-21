import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_provider.dart';

/// App 版面（2026-11-22 使用者要三種自己選）。id 跟後端 APP_LAYOUT_IDS 一樣。
enum AppLayout {
  cards('cards', '功能卡片', '首頁一格一格點，記帳分成 5 組'),
  sidebar('sidebar', '左邊選單', '左邊固定一排選單，記帳一頁就好、少用的收進「更多功能」'),
  ai('ai', 'AI 優先', '首頁最上面直接打字跟 AI 說，記帳 3 個大分頁');

  const AppLayout(this.id, this.label, this.description);

  final String id;
  final String label;
  final String description;

  static AppLayout byId(String? id) => AppLayout.values.firstWhere((l) => l.id == id, orElse: () => AppLayout.cards);
}

/// 跟外觀風格一樣存兩份：本機（開 App 不會先閃一下別的版面）＋伺服器（電腦和平板同步）。
class AppLayoutController extends Notifier<AppLayout> {
  static const _key = 'life_os_app_layout';
  static const _storage = FlutterSecureStorage();

  @override
  AppLayout build() {
    _loadLocal();
    return AppLayout.cards;
  }

  Future<void> _loadLocal() async {
    try {
      final saved = await _storage.read(key: _key);
      if (saved != null && saved != state.id) state = AppLayout.byId(saved);
    } catch (_) {
      // 讀不到（測試環境、儲存區壞掉）就用預設
    }
  }

  Future<void> _saveLocal(AppLayout layout) async {
    try {
      await _storage.write(key: _key, value: layout.id);
    } catch (_) {}
  }

  void applyFromServer(String? id) {
    if (id == null) return;
    final layout = AppLayout.byId(id);
    if (layout == state) return;
    state = layout;
    _saveLocal(layout);
  }

  Future<void> select(AppLayout layout) async {
    state = layout;
    // 本機存檔不用等（測試環境沒有安全儲存區時可能卡住），伺服器那份要等，失敗才能告訴使用者。
    unawaited(_saveLocal(layout));
    await ref.read(apiClientProvider).updateMe(appLayout: layout.id);
  }
}

final appLayoutProvider = NotifierProvider<AppLayoutController, AppLayout>(AppLayoutController.new);
