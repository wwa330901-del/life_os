import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/models/app_user.dart';
import '../core/token_storage.dart';
import '../services/auth/google_oauth_service.dart';
import 'space_provider.dart';

class AuthSession {
  const AuthSession({required this.token, required this.user});

  final String token;
  final AppUser user;
}

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => SecureTokenStorage(),
);

class AuthController extends AsyncNotifier<AuthSession?> {
  @override
  Future<AuthSession?> build() async {
    final storage = ref.read(tokenStorageProvider);
    final token = await storage.read();
    if (token == null) return null;

    final api = ref.read(apiClientProvider);
    api.setToken(token);
    try {
      final user = await api.me();
      return AuthSession(token: token, user: user);
    } catch (_) {
      // Stored token is stale or invalid — fall back to logged-out state.
      await storage.clear();
      api.setToken(null);
      return null;
    }
  }

  Future<void> login({required String email, required String password}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(apiClientProvider);
      final result = await api.login(email: email, password: password);
      return _persist(result);
    });
  }

  /// Registering never logs in directly — the account needs its email
  /// verified first. Kept off the shared auth state entirely; the register
  /// screen manages its own loading/error UI and navigates to the
  /// verification screen on success.
  Future<String> register({
    required String email,
    required String password,
    required String name,
  }) {
    return ref.read(apiClientProvider).register(email: email, password: password, name: name);
  }

  Future<void> verifyEmail({required String email, required String code}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final api = ref.read(apiClientProvider);
      final result = await api.verifyEmail(email: email, code: code);
      return _persist(result);
    });
  }

  Future<void> resendVerification(String email) {
    return ref.read(apiClientProvider).resendVerification(email);
  }

  Future<void> loginWithGoogle() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final oauth = await GoogleOAuthService().signIn();
      final api = ref.read(apiClientProvider);
      final result = await api.googleLogin(code: oauth.code, redirectUri: oauth.redirectUri);
      return _persist(result);
    });
  }

  Future<void> logout() async {
    ref.read(apiClientProvider).setToken(null);
    await ref.read(tokenStorageProvider).clear();
    ref.read(selectedSpaceProvider.notifier).clear();
    state = const AsyncValue.data(null);
  }

  Future<AuthSession> _persist(AuthResult result) async {
    ref.read(apiClientProvider).setToken(result.accessToken);
    await ref.read(tokenStorageProvider).write(result.accessToken);
    return AuthSession(token: result.accessToken, user: result.user);
  }
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthSession?>(AuthController.new);
