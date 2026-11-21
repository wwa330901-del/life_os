import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/app_user.dart';
import '../../core/models/finance.dart';
import '../../state/auth_provider.dart';
import '../../state/space_provider.dart';
import '../widgets/ai_settings_dialog.dart';
import '../widgets/error_panel.dart';

/// 元序的 LINE 官方帳號（加好友連結）。
const lineOfficialId = '@260fpshj';
final lineAddFriendUrl = Uri.parse('https://line.me/R/ti/p/$lineOfficialId');

/// 新手引導（2026-11-22）：新帳號第一次登入才出現，3 步，每一步都能「先跳過」。
/// ① 錢放在哪裡（建帳戶）② 連結 LINE ③ 貼 AI 金鑰。做完或跳過就記在伺服器，不會再出現。
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  int _step = 0;
  bool _finishing = false;

  static const _titles = ['先告訴我，你的錢放在哪裡？', '連結 LINE，用講的就能記帳', '最後，貼上 AI 金鑰'];

  Future<void> _next() async {
    if (_step < _titles.length - 1) {
      setState(() => _step++);
      return;
    }
    setState(() => _finishing = true);
    try {
      await ref.read(authControllerProvider.notifier).finishOnboarding();
    } catch (e) {
      // 伺服器沒記到也已經讓他進去了，只是下次可能還會看到
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = ref.watch(authControllerProvider).value?.user.name ?? '';
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_step == 0) ...[
                        Text('歡迎，$name！', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                      ],
                      Row(
                        children: [
                          for (var i = 0; i < _titles.length; i++)
                            Expanded(
                              child: Container(
                                height: 4,
                                margin: EdgeInsets.only(right: i < _titles.length - 1 ? 6 : 0),
                                decoration: BoxDecoration(
                                  color: i <= _step ? scheme.primary : scheme.surfaceContainerHighest,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('第 ${_step + 1} 步，共 ${_titles.length} 步', style: TextStyle(color: scheme.onSurfaceVariant)),
                      const SizedBox(height: 8),
                      Text(_titles[_step], style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 16),
                      switch (_step) {
                        0 => _AccountsStep(onDone: _next),
                        1 => _LineStep(onDone: _next),
                        _ => _AiStep(onDone: _next, finishing: _finishing),
                      },
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

Widget _actions(BuildContext context, {required VoidCallback? onSkip, required VoidCallback? onNext, String nextLabel = '下一步'}) {
  return Padding(
    padding: const EdgeInsets.only(top: 20),
    child: Row(
      children: [
        TextButton(onPressed: onSkip, child: const Text('先跳過')),
        const Spacer(),
        FilledButton(onPressed: onNext, child: Text(nextLabel)),
      ],
    ),
  );
}

/// ① 錢放在哪裡：勾選有的帳戶、填現在大概有多少，直接建好。
class _AccountsStep extends ConsumerStatefulWidget {
  const _AccountsStep({required this.onDone});

  final VoidCallback onDone;

  @override
  ConsumerState<_AccountsStep> createState() => _AccountsStepState();
}

class _AccountRow {
  _AccountRow(this.type, String name, {this.checked = false}) : nameController = TextEditingController(text: name);

  final FinanceAccountType type;
  final TextEditingController nameController;
  final amountController = TextEditingController();
  bool checked;
  String? error;
}

class _AccountsStepState extends ConsumerState<_AccountsStep> {
  final _rows = [
    _AccountRow(FinanceAccountType.cash, '現金', checked: true),
    _AccountRow(FinanceAccountType.bank, '銀行帳戶'),
    _AccountRow(FinanceAccountType.creditCard, '信用卡'),
  ];
  bool _saving = false;

  @override
  void dispose() {
    for (final r in _rows) {
      r.nameController.dispose();
      r.amountController.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    var ok = true;
    for (final r in _rows) {
      r.error = null;
      if (!r.checked) continue;
      final text = r.amountController.text.replaceAll(',', '').trim();
      if (text.isNotEmpty && double.tryParse(text) == null) {
        r.error = '只能打數字，例如 5000';
        ok = false;
      }
      if (r.nameController.text.trim().isEmpty) {
        r.error = '請填帳戶名稱';
        ok = false;
      }
    }
    setState(() {});
    if (!ok) return;
    final checked = _rows.where((r) => r.checked).toList();
    if (checked.isEmpty) {
      widget.onDone();
      return;
    }

    setState(() => _saving = true);
    try {
      final spaces = await ref.read(mySpacesProvider.future);
      final personal = spaces.firstWhere((s) => s.type == SpaceType.personal);
      final api = ref.read(apiClientProvider);
      for (final r in checked) {
        final amount = double.tryParse(r.amountController.text.replaceAll(',', '').trim()) ?? 0;
        await api.createFinanceAccount(
          spaceId: personal.id,
          name: r.nameController.text.trim(),
          type: r.type,
          // 信用卡填的是「欠多少」，存成負數
          initialBalance: r.type == FinanceAccountType.creditCard ? -amount.abs() : amount,
        );
      }
      widget.onDone();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e, prefix: '帳戶沒建好'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('勾選你有的，填現在大概有多少就好，之後隨時可以改。', style: TextStyle(color: scheme.onSurfaceVariant, height: 1.5)),
        const SizedBox(height: 12),
        for (final r in _rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(value: r.checked, onChanged: (v) => setState(() => r.checked = v ?? false)),
                Expanded(
                  child: TextField(
                    controller: r.nameController,
                    enabled: r.checked,
                    decoration: const InputDecoration(labelText: '帳戶名稱', isDense: true),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 150,
                  child: TextField(
                    controller: r.amountController,
                    enabled: r.checked,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(
                      labelText: r.type == FinanceAccountType.creditCard ? '現在欠多少' : '現在有多少',
                      isDense: true,
                      errorText: r.error,
                    ),
                  ),
                ),
              ],
            ),
          ),
        _actions(context, onSkip: _saving ? null : widget.onDone, onNext: _saving ? null : _save),
      ],
    );
  }
}

/// ② 連結 LINE：加好友＋傳綁定碼。
class _LineStep extends ConsumerStatefulWidget {
  const _LineStep({required this.onDone});

  final VoidCallback onDone;

  @override
  ConsumerState<_LineStep> createState() => _LineStepState();
}

class _LineStepState extends ConsumerState<_LineStep> {
  String? _code;
  bool _loading = false;

  Future<void> _getCode() async {
    setState(() => _loading = true);
    try {
      final result = await ref.read(apiClientProvider).generateLineLinkCode();
      setState(() => _code = result.code);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '連結後，在 LINE 直接說「午餐 120」「明天 3 點看牙醫」就會幫你記好，提醒和每天早報也會傳到 LINE。',
          style: TextStyle(color: scheme.onSurfaceVariant, height: 1.5),
        ),
        const SizedBox(height: 16),
        Text('1. 加元序的 LINE 好友（ID：$lineOfficialId）', style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            onPressed: () => launchUrl(lineAddFriendUrl, mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.person_add_alt_1_outlined),
            label: const Text('加 LINE 好友'),
          ),
        ),
        const SizedBox(height: 16),
        const Text('2. 把綁定碼傳給元序', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        if (_code == null)
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton(onPressed: _loading ? null : _getCode, child: const Text('產生綁定碼')),
          )
        else
          Row(
            children: [
              SelectableText(_code!, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: 4)),
              const SizedBox(width: 12),
              TextButton.icon(
                onPressed: () => Clipboard.setData(ClipboardData(text: _code!)),
                icon: const Icon(Icons.copy, size: 16),
                label: const Text('複製'),
              ),
            ],
          ),
        if (_code != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('在 LINE 傳這組數字給元序，看到「綁定成功」就好了。', style: TextStyle(color: scheme.onSurfaceVariant)),
          ),
        _actions(context, onSkip: widget.onDone, onNext: widget.onDone),
      ],
    );
  }
}

/// ③ AI 金鑰：沒有的話 LINE 和 App 的 AI 不會動；直接開「AI 設定」貼。
class _AiStep extends ConsumerWidget {
  const _AiStep({required this.onDone, required this.finishing});

  final VoidCallback onDone;
  final bool finishing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          '用講的記帳、問問題、幫你規劃，都要用 AI。AI 金鑰是你自己的 Claude 帳號給的一串字，貼上後用多少算多少（一般一個月幾百元以內）。'
          '還沒有的話可以先跳過，之後在「設定 → AI 設定」再貼。',
          style: TextStyle(color: scheme.onSurfaceVariant, height: 1.5),
        ),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton.tonalIcon(
            onPressed: () => showDialog<void>(context: context, builder: (_) => const AiSettingsDialog()),
            icon: const Icon(Icons.key_outlined),
            label: const Text('打開 AI 設定（有申請教學）'),
          ),
        ),
        _actions(context, onSkip: finishing ? null : onDone, onNext: finishing ? null : onDone, nextLabel: '完成，開始使用'),
      ],
    );
  }
}
