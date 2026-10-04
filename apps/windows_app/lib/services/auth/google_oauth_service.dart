import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/google_oauth_config.dart';

class GoogleOAuthResult {
  const GoogleOAuthResult({required this.code, required this.redirectUri});

  final String code;
  final String redirectUri;
}

/// Desktop OAuth flow per RFC 8252: open the system browser to Google's
/// consent screen, catch the redirect on a one-shot local loopback server,
/// and hand the raw authorization code back to the caller. The backend
/// (holding the client_secret) does the actual code-for-token exchange —
/// see `AuthService.googleLogin` / `GoogleCalendarService.connect` — so
/// nothing sensitive lives in this app.
class GoogleOAuthService {
  /// Plain sign-in — just enough scope to identify the user, no offline
  /// access requested (nothing beyond this one login needs a token).
  Future<GoogleOAuthResult> signIn() => _runFlow(scope: 'openid email profile');

  /// Incremental consent for a 行事曆空間's Google Calendar connection —
  /// `access_type=offline` + `prompt=consent` so Google actually returns a
  /// refresh token (it's otherwise only issued on a user's *first* consent
  /// for a given scope, which isn't reliable to depend on), and the
  /// calendar scope on top of plain sign-in's.
  Future<GoogleOAuthResult> connectCalendar() => _runFlow(
    scope: 'openid email profile https://www.googleapis.com/auth/calendar',
    extraParams: {'access_type': 'offline', 'prompt': 'consent'},
  );

  Future<GoogleOAuthResult> _runFlow({
    required String scope,
    Map<String, String> extraParams = const {},
  }) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final redirectUri = 'http://127.0.0.1:${server.port}';

    final authUrl = Uri.https('accounts.google.com', '/o/oauth2/v2/auth', {
      'client_id': googleOAuthClientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': scope,
      ...extraParams,
    });

    final completer = Completer<String>();
    final subscription = server.listen((request) async {
      final code = request.uri.queryParameters['code'];
      final error = request.uri.queryParameters['error'];
      request.response.headers.contentType = ContentType.html;
      if (code != null) {
        request.response.write(
          Platform.isAndroid
              // yuanxu:// 在 AndroidManifest 註冊給 MainActivity，按了直接切回 App。
              ? '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
                    '<body style="font-family:sans-serif;text-align:center;padding-top:20vh">'
                    '<h2>授權完成</h2>'
                    '<p><a href="yuanxu://login" style="display:inline-block;padding:14px 28px;'
                    'background:#c97d3e;color:#fff;border-radius:12px;text-decoration:none;font-size:18px">'
                    '回到元序</a></p></body></html>'
              : '<html><body><h2>授權完成，可以關閉這個分頁。</h2></body></html>',
        );
        if (!completer.isCompleted) completer.complete(code);
      } else {
        request.response.write(
          '<html><body><h2>授權失敗：${error ?? '未知錯誤'}</h2></body></html>',
        );
        if (!completer.isCompleted) {
          completer.completeError(StateError(error ?? 'Google OAuth failed'));
        }
      }
      await request.response.close();
    });

    try {
      final launched = await launchUrl(authUrl, mode: LaunchMode.externalApplication);
      if (!launched) {
        throw StateError('無法開啟瀏覽器');
      }
      final code = await completer.future.timeout(const Duration(minutes: 5));
      await _waitUntilForeground();
      return GoogleOAuthResult(code: code, redirectUri: redirectUri);
    } finally {
      await subscription.cancel();
      await server.close(force: true);
    }
  }

  /// 拿到授權碼時使用者通常還停在瀏覽器，App 在背景——Android（尤其 Samsung
  /// 省電）會中斷背景 App 的連線，這時把授權碼送到後端會失敗
  /// （2026-10-05 平板「Software caused connection abort」）。等回到 App 再送。
  Future<void> _waitUntilForeground() async {
    if (!Platform.isAndroid) return;
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      final resumed = Completer<void>();
      final listener = AppLifecycleListener(
        onResume: () {
          if (!resumed.isCompleted) resumed.complete();
        },
      );
      try {
        await resumed.future.timeout(const Duration(minutes: 5));
      } finally {
        listener.dispose();
      }
    }
    // 剛切回來網路有時還沒恢復，稍等一下。
    await Future<void>.delayed(const Duration(milliseconds: 500));
  }
}
