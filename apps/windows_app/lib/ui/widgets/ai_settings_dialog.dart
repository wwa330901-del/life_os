import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../state/ai_usage_provider.dart';
import '../../state/auth_provider.dart';

/// 知識庫的 AI 分析用 Gemini，每個人自己的用量bill到自己的 Google 帳號——沒有
/// 平台共用金鑰、沒有退回機制，所以這裡同時給申請步驟說明跟金鑰輸入欄位，讓
/// 使用者打開就知道怎麼做，不用另外找文件。
class AiSettingsDialog extends ConsumerStatefulWidget {
  const AiSettingsDialog({super.key});

  @override
  ConsumerState<AiSettingsDialog> createState() => _AiSettingsDialogState();
}

class _AiSettingsDialogState extends ConsumerState<AiSettingsDialog> {
  final _keyController = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  Future<void> _openAiStudio() async {
    await launchUrl(Uri.parse('https://aistudio.google.com'), mode: LaunchMode.externalApplication);
  }

  Future<void> _save() async {
    final apiKey = _keyController.text.trim();
    if (apiKey.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).setGeminiApiKey(apiKey);
      ref.invalidate(hasGeminiApiKeyProvider);
      _keyController.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已儲存')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _clear() async {
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).clearGeminiApiKey();
      ref.invalidate(hasGeminiApiKeyProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已清除')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasKeyAsync = ref.watch(hasGeminiApiKeyProvider);

    return AlertDialog(
      title: const Text('AI 設定'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '知識庫的內容分析用 Google Gemini，每個人要用自己申請的金鑰，用量算在你自己的 Google 帳號，沒設定金鑰就無法使用這個功能。',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 12),
              Text('怎麼申請：', style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 4),
              const Text(
                '1. 前往 aistudio.google.com，用你的 Google 帳號登入\n'
                '2. 點選「Get API key」→「Create API key」\n'
                '3. 第一次使用時選預設專案即可（沒有的話會自動建立一個）\n'
                '4. 建立完成後複製顯示的金鑰字串，貼到下面的欄位',
                style: TextStyle(fontSize: 13),
              ),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: _openAiStudio,
                icon: const Icon(Icons.open_in_new, size: 16),
                label: const Text('打開 aistudio.google.com'),
              ),
              const Divider(height: 24),
              hasKeyAsync.when(
                data: (hasKey) => Row(
                  children: [
                    Icon(
                      hasKey ? Icons.check_circle : Icons.error_outline,
                      size: 16,
                      color: hasKey ? Colors.green : Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(width: 6),
                    Text(hasKey ? '目前已設定金鑰' : '目前尚未設定金鑰'),
                  ],
                ),
                loading: () => const LinearProgressIndicator(),
                error: (error, _) => Text('讀取失敗：$error'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _keyController,
                obscureText: _obscure,
                decoration: InputDecoration(
                  labelText: '貼上你的 Gemini API 金鑰',
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 18),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : _clear,
          child: const Text('清除金鑰'),
        ),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
        FilledButton(onPressed: _submitting ? null : _save, child: const Text('儲存')),
      ],
    );
  }
}
