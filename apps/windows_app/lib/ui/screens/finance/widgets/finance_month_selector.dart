import 'package:flutter/material.dart';

/// Prev/next month arrows around a `"YYYY年M月"` label — shared by every
/// 記帳 tab that scopes its data to one calendar month.
class FinanceMonthSelector extends StatelessWidget {
  const FinanceMonthSelector({super.key, required this.month, required this.onChanged});

  /// `"YYYY-MM"`.
  final String month;
  final ValueChanged<String> onChanged;

  static String monthKeyOf(DateTime date) =>
      '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}';

  void _shift(int delta) {
    final parts = month.split('-');
    final year = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    final shifted = DateTime(year, m + delta, 1);
    onChanged(monthKeyOf(shifted));
  }

  @override
  Widget build(BuildContext context) {
    final parts = month.split('-');
    final label = '${parts[0]}年${int.parse(parts[1])}月';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(icon: const Icon(Icons.chevron_left), onPressed: () => _shift(-1)),
        SizedBox(
          width: 96,
          child: Text(label, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
        ),
        IconButton(icon: const Icon(Icons.chevron_right), onPressed: () => _shift(1)),
      ],
    );
  }
}
