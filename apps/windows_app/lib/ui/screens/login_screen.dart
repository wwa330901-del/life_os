import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../state/auth_provider.dart';
import 'register_screen.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await ref
        .read(authControllerProvider.notifier)
        .login(username: _usernameController.text.trim(), password: _passwordController.text);
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(gradient: AppGradients.dawn),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Card(
              margin: const EdgeInsets.all(24),
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('元序', style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: 4),
                      Text(
                        '秩序，不是束縛，而是讓萬物自由運行',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.secondary,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 28),
                      TextFormField(
                        controller: _usernameController,
                        decoration: const InputDecoration(labelText: '帳號'),
                        onFieldSubmitted: (_) => _submit(),
                        validator: (value) =>
                            (value == null || value.trim().isEmpty) ? '請輸入帳號' : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _passwordController,
                        decoration: const InputDecoration(labelText: '密碼'),
                        obscureText: true,
                        onFieldSubmitted: (_) => _submit(),
                        validator: (value) =>
                            (value == null || value.isEmpty) ? '請輸入密碼' : null,
                      ),
                      const SizedBox(height: 24),
                      if (authState.hasError)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            authState.error.toString(),
                            style: TextStyle(color: scheme.error),
                          ),
                        ),
                      FilledButton(
                        onPressed: isLoading ? null : _submit,
                        child: isLoading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('登入'),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: isLoading
                            ? null
                            : () => Navigator.of(context).push(
                                MaterialPageRoute(builder: (_) => const RegisterScreen()),
                              ),
                        child: const Text('還沒有帳號？註冊'),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(child: Divider(color: scheme.outline)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            child: Text('或', style: Theme.of(context).textTheme.bodySmall),
                          ),
                          Expanded(child: Divider(color: scheme.outline)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: isLoading
                            ? null
                            : () => ref.read(authControllerProvider.notifier).loginWithGoogle(),
                        icon: const Icon(Icons.g_mobiledata, size: 24),
                        label: const Text('使用 Google 登入'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
