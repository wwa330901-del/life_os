import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api_client.dart';
import '../../state/ai_usage_provider.dart';
import '../../state/auth_provider.dart';

/// AI 設定（2026-10-02 起 AI 主要用 Claude）：每個人用自己的金鑰，用量算在自己的
/// 帳戶——沒有平台共用金鑰。Claude 負責全部 AI（LINE／App 對話、規劃、收據、
/// 知識庫）；Gemini 只負責 Claude 做不到的語音轉文字跟看影片，可以不設。
class AiSettingsDialog extends ConsumerWidget {
  const AiSettingsDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AlertDialog(
      title: const Text('AI 設定'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '每個人用自己申請的金鑰，用量算在你自己的帳戶。',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 16),
              _KeySection(
                title: 'Claude 金鑰（必填）',
                purpose: 'LINE 和 App 的 AI 對話、記帳、排行程、規劃、拍收據、知識庫分析都用它。',
                steps: '1. 前往 console.anthropic.com，用 Google 帳號登入\n'
                    '2. 左邊「Billing」綁信用卡並儲值（最少 5 美元），建議到「Limits」設每月上限\n'
                    '3. 左邊「API Keys」→「Create Key」→ 複製 sk-ant- 開頭的金鑰（只會顯示一次）\n'
                    '4. 貼到下面的欄位',
                url: 'https://console.anthropic.com',
                hint: '貼上你的 Claude API 金鑰（sk-ant-…）',
                provider: hasClaudeApiKeyProvider,
                save: (api, key) => api.setClaudeApiKey(key),
                clear: (api) => api.clearClaudeApiKey(),
              ),
              const Divider(height: 32),
              _KeySection(
                title: 'Gemini 金鑰（選填）',
                purpose: 'Claude 聽不到聲音、看不了影片，所以 LINE 語音訊息轉文字、知識庫的影片分析用 Gemini。免費的金鑰就夠用。',
                steps: '1. 前往 aistudio.google.com，用 Google 帳號登入\n'
                    '2. 「Get API key」→「Create API key」，選「建立新專案」（沒綁信用卡＝免費）\n'
                    '3. 複製金鑰貼到下面的欄位',
                url: 'https://aistudio.google.com',
                hint: '貼上你的 Gemini API 金鑰',
                provider: hasGeminiApiKeyProvider,
                save: (api, key) => api.setGeminiApiKey(key),
                clear: (api) => api.clearGeminiApiKey(),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉')),
      ],
    );
  }
}

class _KeySection extends ConsumerStatefulWidget {
  const _KeySection({
    required this.title,
    required this.purpose,
    required this.steps,
    required this.url,
    required this.hint,
    required this.provider,
    required this.save,
    required this.clear,
  });

  final String title;
  final String purpose;
  final String steps;
  final String url;
  final String hint;
  final FutureProvider<bool> provider;
  final Future<void> Function(ApiClient api, String key) save;
  final Future<void> Function(ApiClient api) clear;

  @override
  ConsumerState<_KeySection> createState() => _KeySectionState();
}

class _KeySectionState extends ConsumerState<_KeySection> {
  final _keyController = TextEditingController();
  bool _submitting = false;
  bool _obscure = true;

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _submitting = true);
    try {
      await action();
      ref.invalidate(widget.provider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _save() async {
    final apiKey = _keyController.text.trim();
    if (apiKey.isEmpty) return;
    await _run(() async {
      await widget.save(ref.read(apiClientProvider), apiKey);
      _keyController.clear();
    }, '已儲存');
  }

  Future<void> _clear() => _run(() => widget.clear(ref.read(apiClientProvider)), '已清除');

  @override
  Widget build(BuildContext context) {
    final hasKeyAsync = ref.watch(widget.provider);
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(widget.title, style: theme.textTheme.titleSmall),
        const SizedBox(height: 4),
        Text(widget.purpose, style: theme.textTheme.bodyMedium),
        const SizedBox(height: 8),
        Text('怎麼申請：', style: theme.textTheme.labelLarge),
        const SizedBox(height: 4),
        Text(widget.steps, style: const TextStyle(fontSize: 13)),
        TextButton.icon(
          onPressed: () => launchUrl(Uri.parse(widget.url), mode: LaunchMode.externalApplication),
          icon: const Icon(Icons.open_in_new, size: 16),
          label: Text('打開 ${Uri.parse(widget.url).host}'),
        ),
        hasKeyAsync.when(
          data: (hasKey) => Row(
            children: [
              Icon(
                hasKey ? Icons.check_circle : Icons.error_outline,
                size: 16,
                color: hasKey ? Colors.green : theme.colorScheme.error,
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
            labelText: widget.hint,
            suffixIcon: IconButton(
              icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 18),
              onPressed: () => setState(() => _obscure = !_obscure),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(onPressed: _submitting ? null : _clear, child: const Text('清除金鑰')),
            const SizedBox(width: 8),
            FilledButton(onPressed: _submitting ? null : _save, child: const Text('儲存')),
          ],
        ),
      ],
    );
  }
}
