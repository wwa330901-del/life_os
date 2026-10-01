import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sentry/sentry.dart';

import 'app.dart';
import 'state/auth_provider.dart';

/// Baked in at build time via `--dart-define=SENTRY_DSN=...` (see
/// .github/workflows/release.yml) — empty by default, which leaves Sentry
/// fully off (safe for local `flutter run` and for anyone building this
/// without a Sentry project of their own).
///
/// Uses plain `sentry`, not `sentry_flutter` — see the comment on the
/// `sentry` dependency in pubspec.yaml for why (the latter breaks the
/// Windows desktop build via an unrelated Android JNI dependency). Error
/// capture is wired up by hand below instead of coming for free from the
/// Flutter-specific package: `FlutterError.onError` for framework-caught
/// errors, `PlatformDispatcher.onError` for platform/async errors outside
/// Flutter's own zone, and `runZonedGuarded` as the outermost net.
///
/// 錯誤自動通報（2026-10-01）：不管有沒有 Sentry，沒接住的錯誤都回報給後端
/// `POST /client-errors`，後端用 LINE 通知管理員。
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  final reported = <String>{};
  String? version;
  PackageInfo.fromPlatform().then((info) => version = info.version).ignore();

  void capture(Object error, StackTrace? stack) {
    if (_sentryDsn.isNotEmpty) Sentry.captureException(error, stackTrace: stack);
    // Same error once per run is enough.
    final message = error.toString();
    if (!reported.add(message)) return;
    container
        .read(apiClientProvider)
        .reportClientError(message, stack: stack?.toString(), appVersion: version)
        .catchError((_) {});
  }

  if (_sentryDsn.isNotEmpty) {
    await Sentry.init((options) {
      options.dsn = _sentryDsn;
      // Matches the backend's sampling rate (apps/api/src/instrument.ts) —
      // errors are always captured regardless of this, this only affects
      // performance-tracing volume.
      options.tracesSampleRate = 0.1;
    });
  }

  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    capture(details.exception, details.stack);
    originalOnError?.call(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    capture(error, stack);
    return true;
  };

  runZonedGuarded(
    () => runApp(UncontrolledProviderScope(container: container, child: const LifeOsApp())),
    capture,
  );
}
