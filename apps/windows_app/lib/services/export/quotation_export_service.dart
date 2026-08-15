import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/models/engineering_finance.dart';
import '../../ui/screens/finance/widgets/finance_format.dart';
import 'cjk_font.dart';

/// 工程報價單 PDF 匯出/列印共用欄位選擇——成本相關欄位全部勾掉，就是一份
/// 可以直接給業主看的版本（單價/複價還在，看不到成本/毛利率）。複價本身
/// 一律顯示，不受這組勾選控制（那是實際要付的錢，不是內部資訊）。
enum QuotationExportColumn { unit, quantity, unitPrice, note, costUnitPrice, costComplexPrice, marginRate, marginAdjustedUnitPrice, negotiatedUnitPrice }

extension QuotationExportColumnX on QuotationExportColumn {
  String get label => switch (this) {
    QuotationExportColumn.unit => '單位',
    QuotationExportColumn.quantity => '數量',
    QuotationExportColumn.unitPrice => '單價',
    QuotationExportColumn.note => '備註',
    QuotationExportColumn.costUnitPrice => '成本單價',
    QuotationExportColumn.costComplexPrice => '成本複價',
    QuotationExportColumn.marginRate => '毛利率',
    QuotationExportColumn.marginAdjustedUnitPrice => 'A建議單價',
    QuotationExportColumn.negotiatedUnitPrice => 'B議價後單價',
  };

  /// 屬於成本/內部資訊的欄位——給業主的版本應該整組勾掉。
  bool get isCostRelated => switch (this) {
    QuotationExportColumn.costUnitPrice ||
    QuotationExportColumn.costComplexPrice ||
    QuotationExportColumn.marginRate ||
    QuotationExportColumn.marginAdjustedUnitPrice ||
    QuotationExportColumn.negotiatedUnitPrice => true,
    _ => false,
  };
}

const defaultQuotationExportColumns = QuotationExportColumn.values;

class QuotationPdfExportService {
  Future<Uint8List> buildPdf({
    required String spaceName,
    required String projectName,
    required EngineeringQuotationTree data,
    required List<QuotationExportColumn> columns,
    PdfPageFormat pageFormat = PdfPageFormat.a4,
  }) async {
    final font = await CjkFont.load();
    final doc = pw.Document(theme: pw.ThemeData.withFont(base: font, bold: font));
    final has = columns.toSet();
    final showCost = has.contains(QuotationExportColumn.costComplexPrice);
    final showMargin = has.contains(QuotationExportColumn.marginRate);
    final landscapeFormat = pageFormat.landscape;

    doc.addPage(
      pw.Page(
        pageFormat: pageFormat,
        build: (context) => pw.Center(
          child: pw.Column(
            mainAxisAlignment: pw.MainAxisAlignment.center,
            children: [
              pw.Text(spaceName, style: const pw.TextStyle(fontSize: 16)),
              pw.SizedBox(height: 24),
              pw.Text(projectName, style: pw.TextStyle(fontSize: 26, fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 16),
              pw.Text('工程報價單', style: const pw.TextStyle(fontSize: 20)),
              pw.SizedBox(height: 48),
              pw.Text(_todayLabel(), style: const pw.TextStyle(fontSize: 12)),
            ],
          ),
        ),
      ),
    );

    doc.addPage(
      pw.MultiPage(
        pageFormat: landscapeFormat,
        header: (context) => pw.Text('$projectName — 工程報價單 總表', style: const pw.TextStyle(fontSize: 14)),
        build: (context) => [
          pw.SizedBox(height: 12),
          pw.TableHelper.fromTextArray(
            headers: ['大項', '複價', if (showCost) '成本複價', if (showMargin) '毛利率'],
            data: [
              for (final node in data.tree)
                [
                  node.name,
                  formatAmount(node.complexPrice),
                  if (showCost) formatAmount(node.costComplexPrice),
                  if (showMargin) '${(node.marginRate * 100).toStringAsFixed(1)}%',
                ],
            ],
            cellAlignments: {
              0: pw.Alignment.centerLeft,
              1: pw.Alignment.centerRight,
              if (showCost) 2: pw.Alignment.centerRight,
              if (showMargin) (showCost ? 3 : 2): pw.Alignment.centerRight,
            },
          ),
          pw.SizedBox(height: 16),
          pw.Text(
            '工程總金額 ${formatAmount(data.grandTotalBeforeSurcharge)}'
            '${showCost ? '　成本 ${formatAmount(data.grandCostTotalBeforeSurcharge)}' : ''}',
          ),
          if (data.surchargeItems.isNotEmpty) ...[
            pw.SizedBox(height: 12),
            pw.Text('附加費用', style: const pw.TextStyle(fontSize: 12, fontWeight: pw.FontWeight.bold)),
            pw.TableHelper.fromTextArray(
              headers: ['項目', '百分比', '金額'],
              data: [
                for (final item in data.surchargeItems)
                  [item.name, '${item.percent}%${item.isTaxLike ? '（特例）' : ''}', formatAmount(item.amount)],
              ],
            ),
          ],
          pw.SizedBox(height: 8),
          pw.Text('總計 ${formatAmount(data.grandTotal)}', style: const pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
        ],
      ),
    );

    doc.addPage(
      pw.MultiPage(
        pageFormat: landscapeFormat,
        header: (context) => pw.Text('$projectName — 工程報價單 詳細表', style: const pw.TextStyle(fontSize: 14)),
        build: (context) => [
          pw.SizedBox(height: 12),
          pw.TableHelper.fromTextArray(
            headers: [
              '項次',
              '項目',
              if (has.contains(QuotationExportColumn.unit)) '單位',
              if (has.contains(QuotationExportColumn.quantity)) '數量',
              if (has.contains(QuotationExportColumn.unitPrice)) '單價',
              '複價',
              if (has.contains(QuotationExportColumn.note)) '備註',
              if (has.contains(QuotationExportColumn.costUnitPrice)) '成本單價',
              if (showCost) '成本複價',
              if (showMargin) '毛利率',
              if (has.contains(QuotationExportColumn.marginAdjustedUnitPrice)) 'A建議單價',
              if (has.contains(QuotationExportColumn.negotiatedUnitPrice)) 'B議價後單價',
            ],
            data: [
              for (final (index, (depth, node)) in data.flattened.indexed)
                [
                  '${index + 1}',
                  '${'　' * depth}${node.name}',
                  if (has.contains(QuotationExportColumn.unit)) node.unit ?? '',
                  if (has.contains(QuotationExportColumn.quantity)) node.quantity?.toString() ?? '',
                  if (has.contains(QuotationExportColumn.unitPrice)) node.unitPrice != null ? formatAmount(node.unitPrice!) : '',
                  formatAmount(node.complexPrice),
                  if (has.contains(QuotationExportColumn.note)) node.note ?? '',
                  if (has.contains(QuotationExportColumn.costUnitPrice))
                    node.costUnitPrice != null ? formatAmount(node.costUnitPrice!) : '',
                  if (showCost) formatAmount(node.costComplexPrice),
                  if (showMargin) '${(node.marginRate * 100).toStringAsFixed(1)}%',
                  if (has.contains(QuotationExportColumn.marginAdjustedUnitPrice))
                    node.marginAdjustedUnitPrice != null ? formatAmount(node.marginAdjustedUnitPrice!) : '',
                  if (has.contains(QuotationExportColumn.negotiatedUnitPrice))
                    node.negotiatedUnitPrice != null ? formatAmount(node.negotiatedUnitPrice!) : '',
                ],
            ],
            cellStyle: const pw.TextStyle(fontSize: 8),
            headerStyle: const pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold),
          ),
        ],
      ),
    );

    return doc.save();
  }

  String _todayLabel() {
    final now = DateTime.now();
    return '${now.year}/${now.month}/${now.day}';
  }
}
