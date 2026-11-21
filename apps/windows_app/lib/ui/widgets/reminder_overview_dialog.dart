import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/auth_provider.dart';
import 'error_panel.dart';

const _kindIcon = {
  'todo': Icons.alarm,
  'birthday': Icons.cake_outlined,
  'card': Icons.credit_card,
  'loan': Icons.payments_outlined,
  'recurring': Icons.autorenew,
  'trip': Icons.flight_takeoff,
};

/// 提醒總覽（2026-11-22）：接下來 14 天會用 LINE 提醒你的事，依日期分組。
class ReminderOverviewDialog extends ConsumerWidget {
  const ReminderOverviewDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('接下來 14 天會提醒你的事'),
      content: SizedBox(
        width: 460,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: ref.read(apiClientProvider).upcomingReminders(),
          builder: (context, snap) {
            if (snap.hasError) return ErrorPanel(error: snap.error!);
            final items = snap.data;
            if (items == null) return const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
            if (items.isEmpty) return const Text('接下來 14 天沒有排好的提醒。');
            final children = <Widget>[];
            String? lastDate;
            for (final i in items) {
              final date = i['date'] as String;
              if (date != lastDate) {
                final d = DateTime.parse(date);
                children.add(Padding(
                  padding: EdgeInsets.only(top: lastDate == null ? 0 : 12, bottom: 4),
                  child: Text(
                    '${d.month}/${d.day}（${'一二三四五六日'[d.weekday - 1]}）',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ));
                lastDate = date;
              }
              final time = i['time'] as String?;
              children.add(ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(_kindIcon[i['kind']] ?? Icons.notifications_outlined, color: scheme.primary),
                title: Text(i['title'] as String),
                trailing: time == null ? null : Text(time, style: TextStyle(color: scheme.onSurfaceVariant)),
              ));
            }
            return SingleChildScrollView(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: children),
            );
          },
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('關閉'))],
    );
  }
}
