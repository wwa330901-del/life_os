import 'package:flutter/material.dart';

import '../../../../services/export/quotation_export_service.dart';

/// 工程報價單匯出/列印前的欄位勾選——「只留單價/複價給業主看」就是把成本
/// 相關欄位（灰底標示）整組取消勾選。
class QuotationExportOptionsDialog extends StatefulWidget {
  const QuotationExportOptionsDialog({super.key});

  static Future<List<QuotationExportColumn>?> show(BuildContext context) {
    return showDialog<List<QuotationExportColumn>>(
      context: context,
      builder: (_) => const QuotationExportOptionsDialog(),
    );
  }

  @override
  State<QuotationExportOptionsDialog> createState() => _QuotationExportOptionsDialogState();
}

class _QuotationExportOptionsDialogState extends State<QuotationExportOptionsDialog> {
  final Set<QuotationExportColumn> _selected = Set.of(defaultQuotationExportColumns);

  void _toggle(QuotationExportColumn column, bool checked) {
    setState(() {
      if (checked) {
        _selected.add(column);
      } else {
        _selected.remove(column);
      }
    });
  }

  void _clearCostColumns() {
    setState(() => _selected.removeWhere((c) => c.isCostRelated));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('匯出/列印欄位'),
      content: SizedBox(
        width: 340,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('複價／總計一律顯示（實際金額），以下欄位可自行勾選。', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: _clearCostColumns,
                icon: const Icon(Icons.visibility_off_outlined, size: 16),
                label: const Text('一鍵取消所有成本欄位（給業主版）'),
              ),
              for (final column in QuotationExportColumn.values)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(
                    column.label,
                    style: column.isCostRelated ? const TextStyle(color: Colors.orange) : null,
                  ),
                  value: _selected.contains(column),
                  onChanged: (checked) => _toggle(column, checked ?? false),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(
            context,
          ).pop(QuotationExportColumn.values.where((c) => _selected.contains(c)).toList()),
          child: const Text('確定'),
        ),
      ],
    );
  }
}
