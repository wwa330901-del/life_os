import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry/sentry.dart';

import 'app.dart';

/// Baked in at build time via `--dart-define=SENTRY_DSN=...` (see
/// .github/workflows/release.yml) — empty by default, which leaves error
/// tracking fully off (safe for local `flutter run` and for anyone
/// building this without a Sentry project of their own).
///
/// Uses plain `sentry`, not `sentry_flutter` — see the comment on the
/// `sentry` dependency in pubspec.yaml for why (the latter breaks the
/// Windows desktop build via an unrelated Android JNI dependency). Error
/// capture is wired up by hand below instead of coming for free from the
/// Flutter-specific package: `FlutterError.onError` for framework-caught
/// errors, `PlatformDispatcher.onError` for platform/async errors outside
/// Flutter's own zone, and `runZonedGuarded` as the outermost net.
const _sentryDsn = String.fromEnvironment('SENTRY_DSN');

Future<void> main() async {
  if (_sentryDsn.isEmpty) {
    runApp(const ProviderScope(child: LifeOsApp()));
    return;
  }

  await Sentry.init((options) {
    options.dsn = _sentryDsn;
    // Matches the backend's sampling rate (apps/api/src/instrument.ts) —
    // errors are always captured regardless of this, this only affects
    // performance-tracing volume.
    options.tracesSampleRate = 0.1;
  });

  final originalOnError = FlutterError.onError;
  FlutterError.onError = (details) {
    Sentry.captureException(details.exception, stackTrace: details.stack);
    originalOnError?.call(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    Sentry.captureException(error, stackTrace: stack);
    return true;
  };

  runZonedGuarded(
    () => runApp(const ProviderScope(child: LifeOsApp())),
    (error, stack) => Sentry.captureException(error, stackTrace: stack),
  );
}
