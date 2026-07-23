import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:life_os_app/app.dart';
import 'package:life_os_app/core/token_storage.dart';
import 'package:life_os_app/state/auth_provider.dart';

class _FakeEmptyTokenStorage implements TokenStorage {
  @override
  Future<String?> read() async => null;

  @override
  Future<void> write(String token) async {}

  @override
  Future<void> clear() async {}
}

void main() {
  testWidgets('shows the login screen when logged out', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenStorageProvider.overrideWithValue(_FakeEmptyTokenStorage()),
        ],
        child: const LifeOsApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('秩序，不是束縛，而是讓萬物自由運行'), findsOneWidget);
  });
}
