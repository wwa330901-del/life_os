import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/app_layout_provider.dart';
import 'error_panel.dart';

/// 版面設定：三種版面自己選，馬上換，電腦和平板同步。
class LayoutPickerDialog extends ConsumerWidget {
  const LayoutPickerDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(appLayoutProvider);
    return AlertDialog(
      title: const Text('版面設定'),
      content: SizedBox(
        width: 420,
        child: RadioGroup<AppLayout>(
          groupValue: current,
          onChanged: (layout) async {
            if (layout == null) return;
            try {
              await ref.read(appLayoutProvider.notifier).select(layout);
            } catch (e) {
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(errorSnackBar(e, prefix: '這台已經換好了，但沒存到伺服器'));
              }
            }
          },
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final layout in AppLayout.values)
                RadioListTile<AppLayout>(
                  value: layout,
                  title: Text(layout.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(layout.description),
                ),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('好了'))],
    );
  }
}
