import 'package:flutter/material.dart';

import '../../core/models/calendar_event.dart';

/// 「存到 Google／iPhone」 — required whenever at least one external calendar
/// is connected (2026-09-30 user rule: 不選不能新增). With nothing connected
/// it just explains the event stays in 元序, since there's nothing to pick.
class CalendarTargetPicker extends StatelessWidget {
  const CalendarTargetPicker({
    super.key,
    required this.targets,
    required this.selected,
    required this.onChanged,
  });

  final List<CalendarSyncTarget> targets;
  final CalendarSyncTarget? selected;
  final ValueChanged<CalendarSyncTarget> onChanged;

  /// Whether the form may be saved with the current [selected].
  static bool isSatisfied(List<CalendarSyncTarget> targets, CalendarSyncTarget? selected) =>
      targets.isEmpty || (selected != null && targets.contains(selected));

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    if (targets.isEmpty) {
      return Text('還沒連結 Google 或 iPhone 行事曆，這筆只會存在元序。', style: textTheme.bodySmall);
    }
    final missing = !isSatisfied(targets, selected);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('存到哪個行事曆（必選）', style: textTheme.labelLarge),
        const SizedBox(height: 6),
        SegmentedButton<CalendarSyncTarget>(
          emptySelectionAllowed: true,
          segments: [
            for (final t in targets)
              ButtonSegment(
                value: t,
                label: Text(t.label),
                icon: Icon(t == CalendarSyncTarget.google ? Icons.g_mobiledata : Icons.phone_iphone, size: 18),
              ),
          ],
          selected: {?selected},
          onSelectionChanged: (s) {
            if (s.isNotEmpty) onChanged(s.first);
          },
        ),
        if (missing)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              '請選一個，新增後會同步到那一邊',
              style: textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error),
            ),
          ),
      ],
    );
  }
}
