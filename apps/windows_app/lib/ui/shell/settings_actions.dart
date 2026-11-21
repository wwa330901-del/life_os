import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../state/auth_provider.dart';
import '../screens/admin/admin_ai_usage_screen.dart';
import '../screens/admin/admin_home_screen.dart';
import '../widgets/ai_settings_dialog.dart';
import '../widgets/error_panel.dart';
import '../widgets/export_backup.dart';
import '../widgets/layout_picker_dialog.dart';
import '../widgets/reminder_settings_dialog.dart';
import '../widgets/theme_picker_dialog.dart';
import '../screens/friends/friends_dialog.dart';

/// 設定類的按鈕（三種版面共用：A、C 放首頁右上角，B 放左邊選單最下面）。
class SettingsAction {
  const SettingsAction(this.label, this.icon, this.onTap);

  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

List<SettingsAction> settingsActions(BuildContext context, WidgetRef ref) {
  final user = ref.read(authControllerProvider).value?.user;
  return [
    SettingsAction('提醒設定', Icons.notifications_outlined, () {
      showDialog<void>(context: context, builder: (_) => const ReminderSettingsDialog());
    }),
    SettingsAction('外觀風格', Icons.palette_outlined, () {
      showDialog<void>(context: context, builder: (_) => const ThemePickerDialog());
    }),
    SettingsAction('版面設定', Icons.dashboard_customize_outlined, () {
      showDialog<void>(context: context, builder: (_) => const LayoutPickerDialog());
    }),
    SettingsAction('AI 設定', Icons.key_outlined, () {
      showDialog<void>(context: context, builder: (_) => const AiSettingsDialog());
    }),
    SettingsAction('匯出備份', Icons.download_outlined, () => exportBackup(context, ref)),
    SettingsAction('好友', Icons.people_outline, () => FriendsDialog.show(context)),
    SettingsAction('改名字', Icons.badge_outlined, () => editDisplayName(context, ref, user?.name ?? '')),
    if (user?.isPlatformAdmin ?? false) ...[
      SettingsAction('AI 用量', Icons.insights_outlined, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AdminAiUsageScreen()));
      }),
      SettingsAction('管理後台', Icons.admin_panel_settings_outlined, () {
        Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AdminHomeScreen()));
      }),
    ],
    SettingsAction('登出', Icons.logout, () => ref.read(authControllerProvider.notifier).logout()),
  ];
}

/// 圖示下面寫字的按鈕（A、C 版首頁右上角）。
class LabeledIconButton extends StatelessWidget {
  const LabeledIconButton({super.key, required this.action});

  final SettingsAction action;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.8);
    return InkWell(
      onTap: action.onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: SizedBox(
          width: 60,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(action.icon, size: 22, color: color),
              const SizedBox(height: 4),
              Text(
                action.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12, color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> editDisplayName(BuildContext context, WidgetRef ref, String currentName) async {
  final controller = TextEditingController(text: currentName);
  final name = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('改名字'),
      content: TextField(
        controller: controller,
        autofocus: true,
        decoration: const InputDecoration(labelText: '顯示名稱'),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.of(context).pop(controller.text.trim()), child: const Text('儲存')),
      ],
    ),
  );
  if (name == null || name.isEmpty || name == currentName || !context.mounted) return;
  try {
    await ref.read(authControllerProvider.notifier).updateName(name);
  } on ApiException catch (e) {
    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e));
  }
}
