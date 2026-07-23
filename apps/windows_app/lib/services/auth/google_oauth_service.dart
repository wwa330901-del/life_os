import 'dart:async';
import 'dart:io';

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
/// see `AuthService.googleLogin` — so nothing sensitive lives in this app.
class GoogleOAuthService {
  Future<GoogleOAuthResult> signIn() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final redirectUri = 'http://127.0.0.1:${server.port}';

    final authUrl = Uri.https('accounts.google.com', '/o/oauth2/v2/auth', {
      'client_id': googleOAuthClientId,
      'redirect_uri': redirectUri,
      'response_type': 'code',
      'scope': 'openid email profile',
    });

    final completer = Completer<String>();
    final subscription = server.listen((request) async {
      final code = request.uri.queryParameters['code'];
      final error = request.uri.queryParameters['error'];
      request.response.headers.contentType = ContentType.html;
      if (code != null) {
        request.response.write('<html><body><h2>登入完成，可以關閉這個分頁。</h2></body></html>');
        if (!completer.isCompleted) completer.complete(code);
      } else {
        request.response.write(
          '<html><body><h2>登入失敗：${error ?? '未知錯誤'}</h2></body></html>',
        );
        if (!completer.isCompleted) {
          completer.completeError(StateError(error ?? 'Google sign-in failed'));
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
      return GoogleOAuthResult(code: code, redirectUri: redirectUri);
    } finally {
      await subscription.cancel();
      await server.close(force: true);
    }
  }
}
