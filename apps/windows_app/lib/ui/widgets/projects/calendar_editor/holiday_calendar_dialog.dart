import 'package:flutter/material.dart';

import '../../../../core/models/holiday_calendar.dart';
import '../../../../core/models/taiwan_holiday_calendar.dart';

const _weekdayOptions = [
  (DateTime.monday, '一'),
  (DateTime.tuesday, '二'),
  (DateTime.wednesday, '三'),
  (DateTime.thursday, '四'),
  (DateTime.friday, '五'),
  (DateTime.saturday, '六'),
  (DateTime.sunday, '日'),
];

/// Lets the user configure a project's working-day rules: which weekdays
/// are off by default, whether Taiwan's official government holidays
/// apply automatically, and individual extra holidays or forced workdays
/// that override both of those for a specific date. Ported from reno_pm's
/// holiday_calendar_dialog.dart.
class HolidayCalendarDialog extends StatefulWidget {
  final HolidayCalendar calendar;

  const HolidayCalendarDialog({super.key, required this.calendar});

  static Future<HolidayCalendar?> show(BuildContext context, HolidayCalendar calendar) {
    return showDialog<HolidayCalendar>(
      context: context,
      builder: (_) => HolidayCalendarDialog(calendar: calendar),
    );
  }

  @override
  State<HolidayCalendarDialog> createState() => _HolidayCalendarDialogState();
}

class _HolidayCalendarDialogState extends State<HolidayCalendarDialog> {
  late Set<int> _weeklyOffDays;
  late bool _useTaiwanGovernmentCalendar;
  late Set<DateTime> _adHocHolidays;
  late Set<DateTime> _adHocWorkdays;

  @override
  void initState() {
    super.initState();
    _weeklyOffDays = {...widget.calendar.weeklyOffDays};
    _useTaiwanGovernmentCalendar = widget.calendar.useTaiwanGovernmentCalendar;
    _adHocHolidays = {...widget.calendar.adHocHolidays};
    _adHocWorkdays = {...widget.calendar.adHocWorkdays};
  }

  Future<void> _addDate(Set<DateTime> target) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    setState(() {
      final normalized = DateTime(picked.year, picked.month, picked.day);
      target.add(normalized);
    });
  }

  String _formatDate(DateTime d) => '${d.year}/${d.month}/${d.day}';

  Widget _buildDateChips(
    Set<DateTime> dates,
    VoidCallback onAdd,
    void Function(DateTime) onRemove,
  ) {
    final sorted = dates.toList()..sort();
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final d in sorted)
          Chip(
            label: Text(_formatDate(d), style: const TextStyle(fontSize: 12)),
            onDeleted: () => setState(() => onRemove(d)),
          ),
        ActionChip(
          avatar: const Icon(Icons.add, size: 16),
          label: const Text('新增日期'),
          onPressed: onAdd,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final mutedText = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    final coveredYears = taiwanHolidayCoveredYears;
    final coverageLabel = coveredYears.isEmpty ? '' : '目前涵蓋 ${coveredYears.first}-${coveredYears.last} 年;';

    return AlertDialog(
      title: const Text('公休日曆設定'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('每週固定公休', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 4,
                children: [
                  for (final option in _weekdayOptions)
                    FilterChip(
                      label: Text(option.$2),
                      selected: _weeklyOffDays.contains(option.$1),
                      onSelected: (selected) {
                        setState(() {
                          if (selected) {
                            _weeklyOffDays.add(option.$1);
                          } else {
                            _weeklyOffDays.remove(option.$1);
                          }
                        });
                      },
                    ),
                ],
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  '自動套用台灣行政院公告假日',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                ),
                subtitle: Text(
                  '$coverageLabel排程時自動判斷國定假日與補班日,一般週六不受影響(工班照常照排)',
                  style: TextStyle(fontSize: 11, color: mutedText),
                ),
                value: _useTaiwanGovernmentCalendar,
                onChanged: (value) => setState(() => _useTaiwanGovernmentCalendar = value),
              ),
              const SizedBox(height: 12),
              const Text('個別加休(國定假日等)', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _buildDateChips(
                _adHocHolidays,
                () => _addDate(_adHocHolidays),
                (d) => _adHocHolidays.remove(d),
              ),
              const SizedBox(height: 20),
              const Text('個別補班(強制上班)', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              _buildDateChips(
                _adHocWorkdays,
                () => _addDate(_adHocWorkdays),
                (d) => _adHocWorkdays.remove(d),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            HolidayCalendar(
              weeklyOffDays: _weeklyOffDays,
              useTaiwanGovernmentCalendar: _useTaiwanGovernmentCalendar,
              adHocHolidays: _adHocHolidays,
              adHocWorkdays: _adHocWorkdays,
            ),
          ),
          child: const Text('確定'),
        ),
      ],
    );
  }
}
