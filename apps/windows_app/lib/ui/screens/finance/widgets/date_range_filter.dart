import 'package:flutter/material.dart';

/// 借貸/代墊歷史查詢共用的日期區間篩選——本週/本月快速選取或自訂區間，
/// `(null, null)` 代表沒有套用篩選（預設狀態）。

String dateRangeFilterLabel(DateTime? from, DateTime? to) {
  if (from == null && to == null) return '篩選日期';
  String fmt(DateTime d) => '${d.year}/${d.month}/${d.day}';
  if (from != null && to != null) return '${fmt(from)}～${fmt(to)}';
  if (from != null) return '${fmt(from)} 起';
  return '至 ${fmt(to!)}';
}

DateTime _startOfWeek(DateTime now) {
  final monday = now.subtract(Duration(days: now.weekday - 1));
  return DateTime(monday.year, monday.month, monday.day);
}

DateTime _startOfMonth(DateTime now) => DateTime(now.year, now.month, 1);
DateTime _endOfMonth(DateTime now) => DateTime(now.year, now.month + 1, 0);

/// 回傳 `null` 表示使用者取消（維持原本篩選不變）；回傳 `(null, null)`
/// 表示使用者選了「清除篩選」。
Future<(DateTime?, DateTime?)?> showDateRangeFilterDialog(
  BuildContext context, {
  DateTime? initialFrom,
  DateTime? initialTo,
}) {
  final now = DateTime.now();
  return showDialog<(DateTime?, DateTime?)>(
    context: context,
    builder: (context) => SimpleDialog(
      title: const Text('篩選日期'),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.of(context).pop((_startOfWeek(now), _startOfWeek(now).add(const Duration(days: 6)))),
          child: const Text('本週'),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.of(context).pop((_startOfMonth(now), _endOfMonth(now))),
          child: const Text('本月'),
        ),
        SimpleDialogOption(
          onPressed: () async {
            final range = await showDateRangePicker(
              context: context,
              firstDate: DateTime(2020),
              lastDate: DateTime(2100),
              initialDateRange: initialFrom != null && initialTo != null
                  ? DateTimeRange(start: initialFrom, end: initialTo)
                  : null,
            );
            if (range == null || !context.mounted) return;
            Navigator.of(context).pop((range.start, range.end));
          },
          child: const Text('自訂區間'),
        ),
        if (initialFrom != null || initialTo != null)
          SimpleDialogOption(
            onPressed: () => Navigator.of(context).pop((null, null)),
            child: const Text('清除篩選'),
          ),
      ],
    ),
  );
}
