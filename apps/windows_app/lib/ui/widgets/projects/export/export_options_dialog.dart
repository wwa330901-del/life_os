import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';

import '../../../../services/export/gantt_export_painter.dart';

class PdfExportOptions {
  final PdfPageFormat pageFormat;
  final String pageSizeLabel;
  final double fillPercent;
  final List<ExportColumn> columns;

  const PdfExportOptions({
    required this.pageFormat,
    required this.pageSizeLabel,
    required this.fillPercent,
    required this.columns,
  });
}

/// Checkbox list letting the user pick which info columns (beyond the
/// always-present task name) appear in the task table next to the chart.
class _ExportColumnPicker extends StatelessWidget {
  final Set<ExportColumn> selected;
  final ValueChanged<Set<ExportColumn>> onChanged;

  const _ExportColumnPicker({required this.selected, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('顯示欄位', style: TextStyle(fontWeight: FontWeight.bold)),
        for (final column in ExportColumn.values)
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(column.label),
            value: selected.contains(column),
            onChanged: (checked) {
              final next = Set<ExportColumn>.from(selected);
              if (checked ?? false) {
                next.add(column);
              } else {
                next.remove(column);
              }
              onChanged(next);
            },
          ),
      ],
    );
  }
}

// A1/A2 aren't built into PdfPageFormat (only A3-A6 are) — constructed from
// the ISO 216 series using the package's own cm unit constant.
const _a2 = PdfPageFormat(42.0 * PdfPageFormat.cm, 59.4 * PdfPageFormat.cm, marginAll: 2.0 * PdfPageFormat.cm);
const _a1 = PdfPageFormat(59.4 * PdfPageFormat.cm, 84.1 * PdfPageFormat.cm, marginAll: 2.0 * PdfPageFormat.cm);

const _pdfPageSizes = [('A4', PdfPageFormat.a4), ('A3', PdfPageFormat.a3), ('A2', _a2), ('A1', _a1)];

/// Lets the user pick a paper size and how much of the page the chart
/// fills before generating the PDF. Always landscape, since a Gantt chart
/// is wide.
class PdfExportOptionsDialog extends StatefulWidget {
  const PdfExportOptionsDialog({super.key});

  static Future<PdfExportOptions?> show(BuildContext context) {
    return showDialog<PdfExportOptions>(context: context, builder: (_) => const PdfExportOptionsDialog());
  }

  @override
  State<PdfExportOptionsDialog> createState() => _PdfExportOptionsDialogState();
}

class _PdfExportOptionsDialogState extends State<PdfExportOptionsDialog> {
  int _sizeIndex = 0;
  double _fillPercent = 100;
  Set<ExportColumn> _columns = Set.of(defaultExportColumns);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('匯出 PDF 設定'),
      content: SizedBox(
        width: 320,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('紙張尺寸(橫向)', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (var i = 0; i < _pdfPageSizes.length; i++)
                    ChoiceChip(
                      label: Text(_pdfPageSizes[i].$1),
                      selected: _sizeIndex == i,
                      onSelected: (_) => setState(() => _sizeIndex = i),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              Text('縮放比例:${_fillPercent.round()}%', style: const TextStyle(fontWeight: FontWeight.bold)),
              Slider(
                value: _fillPercent,
                min: 50,
                max: 100,
                divisions: 10,
                label: '${_fillPercent.round()}%',
                onChanged: (value) => setState(() => _fillPercent = value),
              ),
              const Text(
                '數值越高,圖表在頁面上顯示越大;數值較低則會縮小並留白,例如預留簽章空間',
                style: TextStyle(fontSize: 11, color: Colors.black54),
              ),
              const SizedBox(height: 20),
              _ExportColumnPicker(selected: _columns, onChanged: (next) => setState(() => _columns = next)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            PdfExportOptions(
              pageFormat: _pdfPageSizes[_sizeIndex].$2,
              pageSizeLabel: _pdfPageSizes[_sizeIndex].$1,
              fillPercent: _fillPercent,
              columns: ExportColumn.values.where((c) => _columns.contains(c)).toList(),
            ),
          ),
          child: const Text('匯出'),
        ),
      ],
    );
  }
}

class PngExportOptions {
  final double pixelRatio;
  final String label;
  final List<ExportColumn> columns;

  const PngExportOptions({required this.pixelRatio, required this.label, required this.columns});
}

const _pngResolutions = [
  ('標準 (2x)', 2.0),
  ('高解析 (4x)', 4.0),
  ('超高解析 (6x)', 6.0),
  ('最高解析 (8x)', 8.0),
];

/// Lets the user pick an output resolution before generating the PNG —
/// higher values produce a larger, sharper (and larger file size) image.
class PngExportOptionsDialog extends StatefulWidget {
  const PngExportOptionsDialog({super.key});

  static Future<PngExportOptions?> show(BuildContext context) {
    return showDialog<PngExportOptions>(context: context, builder: (_) => const PngExportOptionsDialog());
  }

  @override
  State<PngExportOptionsDialog> createState() => _PngExportOptionsDialogState();
}

class _PngExportOptionsDialogState extends State<PngExportOptionsDialog> {
  int _index = 1; // 4x, matches the previous fixed default.
  Set<ExportColumn> _columns = Set.of(defaultExportColumns);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('匯出圖片設定'),
      content: SizedBox(
        width: 280,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('解析度', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text('解析度越高,圖片越清晰、檔案也越大', style: TextStyle(fontSize: 11, color: Colors.black54)),
              const SizedBox(height: 8),
              RadioGroup<int>(
                groupValue: _index,
                onChanged: (value) => setState(() => _index = value!),
                child: Column(
                  children: [
                    for (var i = 0; i < _pngResolutions.length; i++)
                      RadioListTile<int>(contentPadding: EdgeInsets.zero, dense: true, title: Text(_pngResolutions[i].$1), value: i),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _ExportColumnPicker(selected: _columns, onChanged: (next) => setState(() => _columns = next)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            PngExportOptions(
              pixelRatio: _pngResolutions[_index].$2,
              label: _pngResolutions[_index].$1,
              columns: ExportColumn.values.where((c) => _columns.contains(c)).toList(),
            ),
          ),
          child: const Text('匯出'),
        ),
      ],
    );
  }
}

class CompactPngExportOptions {
  final double pixelRatio;
  final String label;
  final List<ExportColumn> columns;

  const CompactPngExportOptions({required this.pixelRatio, required this.label, required this.columns});
}

/// Lets the user pick a rendering resolution before generating a
/// size-capped, color-quantized PNG — small enough that chat apps (e.g.
/// LINE) treat it as an inline photo instead of a generic file. Output
/// size is controlled by quantization (and, if needed, downscaling) to
/// roughly 800KB, so resolution here only affects sharpness, not the
/// final file size.
class CompactPngExportOptionsDialog extends StatefulWidget {
  const CompactPngExportOptionsDialog({super.key});

  static Future<CompactPngExportOptions?> show(BuildContext context) {
    return showDialog<CompactPngExportOptions>(context: context, builder: (_) => const CompactPngExportOptionsDialog());
  }

  @override
  State<CompactPngExportOptionsDialog> createState() => _CompactPngExportOptionsDialogState();
}

class _CompactPngExportOptionsDialogState extends State<CompactPngExportOptionsDialog> {
  int _index = 1; // 4x, matches the previous fixed default.
  Set<ExportColumn> _columns = Set.of(defaultExportColumns);

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('匯出小檔案圖片設定'),
      content: SizedBox(
        width: 280,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('解析度', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              const Text(
                '解析度越高,圖片越清晰;檔案大小會自動壓縮至 800KB 以下,適合傳送給 LINE 等通訊軟體',
                style: TextStyle(fontSize: 11, color: Colors.black54),
              ),
              const SizedBox(height: 8),
              RadioGroup<int>(
                groupValue: _index,
                onChanged: (value) => setState(() => _index = value!),
                child: Column(
                  children: [
                    for (var i = 0; i < _pngResolutions.length; i++)
                      RadioListTile<int>(contentPadding: EdgeInsets.zero, dense: true, title: Text(_pngResolutions[i].$1), value: i),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _ExportColumnPicker(selected: _columns, onChanged: (next) => setState(() => _columns = next)),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(
            CompactPngExportOptions(
              pixelRatio: _pngResolutions[_index].$2,
              label: _pngResolutions[_index].$1,
              columns: ExportColumn.values.where((c) => _columns.contains(c)).toList(),
            ),
          ),
          child: const Text('匯出'),
        ),
      ],
    );
  }
}
