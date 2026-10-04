import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/theme/app_themes.dart';
import 'auth_provider.dart';

/// 目前的外觀風格 id。存兩份：
/// - 本機（開 App、還沒登入時就能用上次的風格，不會先閃一下預設的）
/// - 伺服器 User.appTheme（電腦和平板同步；登入後以伺服器為準）
class AppThemeController extends Notifier<String> {
  static const _key = 'life_os_app_theme';
  static const _storage = FlutterSecureStorage();

  /// 只給測試截圖用：`--dart-define=LIFE_OS_THEME=night` 直接用某一套、不讀本機設定
  static const _forced = String.fromEnvironment('LIFE_OS_THEME');

  @override
  String build() {
    if (_forced.isNotEmpty) return themeById(_forced).id;
    _loadLocal();
    return defaultThemeId;
  }

  Future<void> _loadLocal() async {
    try {
      final saved = await _storage.read(key: _key);
      if (saved != null && saved != state) state = themeById(saved).id;
    } catch (_) {
      // 讀不到（測試環境、儲存區壞掉）就用預設風格
    }
  }

  Future<void> _saveLocal(String id) async {
    try {
      await _storage.write(key: _key, value: id);
    } catch (_) {}
  }

  /// 登入後伺服器上記的風格
  void applyFromServer(String? id) {
    if (id == null) return;
    final resolved = themeById(id).id;
    if (resolved == state) return;
    state = resolved;
    _saveLocal(resolved);
  }

  /// 使用者在「外觀風格」選了一套：馬上換，存本機，再存到伺服器。
  Future<void> select(String id) async {
    final resolved = themeById(id).id;
    state = resolved;
    await _saveLocal(resolved);
    await ref.read(apiClientProvider).updateMe(appTheme: resolved);
  }
}

final appThemeProvider = NotifierProvider<AppThemeController, String>(AppThemeController.new);
