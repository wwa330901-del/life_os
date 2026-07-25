import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../core/models/project.dart';
import '../../core/models/schedule_result.dart';
import '../../core/models/work_item.dart';
import 'gantt_export_painter.dart';

const pdfExportMargin = 16.0;

class PdfExportService {
  Future<Uint8List> buildPdf({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    required DateTime today,
    PdfPageFormat pageFormat = PdfPageFormat.a4,
    // How much of the printable area the chart fills, 0-100. 100 behaves
    // like a plain fit-to-page; lower values shrink it (centered, more
    // margin) — e.g. to leave room for notes/a stamp when printed.
    double fillPercent = 100,
    List<ExportColumn> columns = defaultExportColumns,
  }) async {
    final pngBytes = await renderGanttToPngBytes(
      project: project,
      orderedItems: orderedItems,
      scheduleResult: scheduleResult,
      today: today,
      columns: columns,
    );
    final image = pw.MemoryImage(pngBytes);
    final doc = pw.Document();
    final landscapeFormat = pageFormat.landscape;
    final clampedFill = fillPercent.clamp(1, 100) / 100;
    final printableWidth = landscapeFormat.width - pdfExportMargin * 2;
    final printableHeight = landscapeFormat.height - pdfExportMargin * 2;

    doc.addPage(
      pw.Page(
        pageFormat: landscapeFormat,
        margin: const pw.EdgeInsets.all(pdfExportMargin),
        build: (context) => pw.Align(
          alignment: pw.Alignment.topLeft,
          child: pw.SizedBox(
            width: printableWidth * clampedFill,
            height: printableHeight * clampedFill,
            child: pw.Image(image, fit: pw.BoxFit.contain, alignment: pw.Alignment.topLeft),
          ),
        ),
      ),
    );
    return doc.save();
  }
}
