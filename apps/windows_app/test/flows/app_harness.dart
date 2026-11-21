import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:life_os_app/app.dart';
import 'package:life_os_app/core/api_client.dart';
import 'package:life_os_app/services/update/update_service.dart';
import 'package:life_os_app/state/auth_provider.dart';
import 'package:life_os_app/state/update_provider.dart';

import 'fake_backend.dart';

class _NoUpdate extends UpdateService {
  @override
  Future<UpdateInfo?> checkForUpdate() async => null;
}

/// 開整個 App（接假後端）。[token] 有給＝已登入。
Future<void> pumpApp(WidgetTester tester, FakeBackend backend, {String? token}) async {
  tester.view.physicalSize = const Size(1400, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiClientProvider.overrideWithValue(ApiClient(baseUrl: 'http://fake', client: backend.client)),
        tokenStorageProvider.overrideWithValue(MemoryTokenStorage(token)),
        updateServiceProvider.overrideWithValue(_NoUpdate()),
      ],
      child: const LifeOsApp(),
    ),
  );
  await tester.pumpAndSettle();
}
