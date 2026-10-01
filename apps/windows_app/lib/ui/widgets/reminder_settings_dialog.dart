import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../state/auth_provider.dart';

/// The LINE reminders, label → backend field (`PATCH /line/settings`).
const _reminders = [
  ('morningBriefEnabled', '每日早報', '每天早上 8 點：今天的行程、代辦、昨天花費、昨晚睡多久'),
  ('todoReminderEnabled', '代辦到期提醒', '有時間的代辦，到期前 1 小時提醒'),
  ('journalReminderEnabled', '日記提醒', '每晚 9:30 還沒寫日記會問你今天過得怎樣'),
  ('reviewEnabled', '週回顧／月回顧', '週日晚上 8 點、每月 1 號早上 9 點'),
  ('goalReminderEnabled', '人生目標提醒', '目標快到期（7 天、1 天前），或 14 天沒更新進度'),
  ('spendingAlertEnabled', '花費異常提醒', '晚上 9 點：哪個分類比平常花太兇、有沒有特別大的單筆'),
  ('subscriptionReminderEnabled', '訂閱扣款提醒', '每月固定扣的訂閱（Netflix、健身房…）扣款前 3 天提醒'),
];

/// App「提醒設定」— same switches as LINE's 「關閉早報」etc. Every reminder is sent via LINE.
class ReminderSettingsDialog extends ConsumerStatefulWidget {
  const ReminderSettingsDialog({super.key});

  @override
  ConsumerState<ReminderSettingsDialog> createState() => _ReminderSettingsDialogState();
}

class _ReminderSettingsDialogState extends ConsumerState<ReminderSettingsDialog> {
  Map<String, dynamic>? _settings;
  String? _linkCode;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final settings = await ref.read(apiClientProvider).getReminderSettings();
      if (mounted) setState(() => _settings = settings);
    } on ApiException catch (e) {
      _snack(e.message);
    }
  }

  Future<void> _toggle(String field, bool value) async {
    setState(() => _settings = {...?_settings, field: value});
    try {
      final settings = await ref.read(apiClientProvider).updateReminderSettings({field: value});
      if (mounted) setState(() => _settings = settings);
    } on ApiException catch (e) {
      if (mounted) setState(() => _settings = {...?_settings, field: !value});
      _snack(e.message);
    }
  }

  Future<void> _generateLinkCode() async {
    try {
      final result = await ref.read(apiClientProvider).generateLineLinkCode();
      if (mounted) setState(() => _linkCode = result.code);
    } on ApiException catch (e) {
      _snack(e.message);
    }
  }

  void _snack(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final settings = _settings;
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('提醒設定'),
      content: SizedBox(
        width: 460,
        child: settings == null
            ? const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (settings['linked'] != true) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: scheme.errorContainer.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('提醒都是用 LINE 傳的，你還沒連結 LINE。'),
                          const SizedBox(height: 8),
                          if (_linkCode == null)
                            FilledButton.tonal(onPressed: _generateLinkCode, child: const Text('產生綁定碼'))
                          else ...[
                            const Text('把這組綁定碼傳給元序的 LINE 官方帳號（10 分鐘內有效）：'),
                            SelectableText(
                              _linkCode!,
                              style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 4),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  for (final (field, title, subtitle) in _reminders)
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(title),
                      subtitle: Text(subtitle),
                      value: settings[field] == true,
                      onChanged: (value) => _toggle(field, value),
                    ),
                  const SizedBox(height: 4),
                  Text(
                    '也可以直接在 LINE 跟助理說「不要再傳早報」「打開日記提醒」。預算超支的通知一直都會傳。',
                    style: TextStyle(fontSize: 12, color: scheme.onSurface.withValues(alpha: 0.6)),
                  ),
                ],
              ),
      ),
      actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('完成'))],
    );
  }
}
