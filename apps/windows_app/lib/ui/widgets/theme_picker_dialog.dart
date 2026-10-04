import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/theme/app_themes.dart';
import '../../state/app_theme_provider.dart';

/// 「外觀風格」：10 套風格的縮圖，點一下馬上換（電腦和平板會同步）。
class ThemePickerDialog extends ConsumerWidget {
  const ThemePickerDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(appThemeProvider);
    final width = MediaQuery.sizeOf(context).width;
    final columns = width >= 900 ? 4 : (width >= 600 ? 3 : 2);
    return AlertDialog(
      title: const Text('外觀風格'),
      content: SizedBox(
        width: 760,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '每個人可以選自己喜歡的，電腦和平板會一起換。',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: columns,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 14,
                crossAxisSpacing: 14,
                childAspectRatio: 1.25,
                children: [
                  for (final spec in appThemes)
                    _ThemeTile(
                      spec: spec,
                      selected: spec.id == current,
                      onTap: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await ref.read(appThemeProvider.notifier).select(spec.id);
                        } catch (_) {
                          messenger.showSnackBar(
                            const SnackBar(content: Text('這台已經換好了，但沒存到伺服器，另一台裝置不會跟著換')),
                          );
                        }
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('完成')),
      ],
    );
  }
}

class _ThemeTile extends StatelessWidget {
  const _ThemeTile({required this.spec, required this.selected, required this.onTap});

  final AppThemeSpec spec;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(16);
    return Semantics(
      button: true,
      selected: selected,
      label: '${spec.name}：${spec.description}',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: radius,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: radius,
              border: Border.all(
                color: selected ? Theme.of(context).colorScheme.primary : spec.border,
                width: selected ? 3 : 1,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Image.asset(spec.backgroundAsset, fit: BoxFit.cover, alignment: Alignment.bottomCenter),
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 縮小版的卡片＋按鈕，看得出這套的顏色和形狀
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: spec.card,
                          borderRadius: BorderRadius.circular(spec.cardRadius / 2),
                          border: Border.all(color: spec.border),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                spec.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.getFont(spec.headFont, fontSize: 16, fontWeight: FontWeight.w700, color: spec.text),
                              ),
                            ),
                            if (selected) Icon(Icons.check_circle, size: 20, color: spec.primary),
                          ],
                        ),
                      ),
                      const Spacer(),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                            decoration: BoxDecoration(
                              color: spec.primary,
                              borderRadius: BorderRadius.circular(spec.buttonRadius >= 999 ? 999 : spec.buttonRadius / 2),
                            ),
                            child: Text('按鈕', style: TextStyle(fontSize: 12, color: spec.onPrimary)),
                          ),
                          const SizedBox(width: 6),
                          for (final c in [spec.accent, spec.chipBg])
                            Container(
                              width: 14,
                              height: 14,
                              margin: const EdgeInsets.only(right: 4),
                              decoration: BoxDecoration(color: c, shape: BoxShape.circle, border: Border.all(color: spec.border)),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
