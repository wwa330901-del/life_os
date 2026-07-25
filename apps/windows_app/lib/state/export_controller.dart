import 'dart:io';

import 'package:file_selector/file_selector.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdf/pdf.dart';

import '../core/models/project.dart';
import '../core/models/schedule_result.dart';
import '../core/models/work_item.dart';
import '../services/export/gantt_export_painter.dart';
import '../services/export/image_export_service.dart';
import '../services/export/pdf_export_service.dart';

final pdfExportServiceProvider = Provider<PdfExportService>((ref) => PdfExportService());
final imageExportServiceProvider = Provider<ImageExportService>((ref) => ImageExportService());

/// Exports still write straight to a local file via `file_selector`'s
/// native save dialog — life_os is a cloud-backed *desktop* app, but the
/// export destination is the same Windows machine the app is already
/// running on, so nothing about that file-write step needs to change from
/// reno_pm's version. Only the data feeding it comes from the API instead
/// of a local `Project` file.
class ExportController {
  final Ref ref;

  ExportController(this.ref);

  Future<bool> exportPng({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    double pixelRatio = exportPixelRatio,
    List<ExportColumn> columns = defaultExportColumns,
  }) async {
    final location = await getSaveLocation(
      suggestedName: '${project.name}.png',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PNG 圖片', extensions: ['png']),
      ],
    );
    if (location == null) return false;
    final path = location.path.endsWith('.png') ? location.path : '${location.path}.png';

    final bytes = await ref
        .read(imageExportServiceProvider)
        .buildPng(
          project: project,
          orderedItems: orderedItems,
          scheduleResult: scheduleResult,
          today: DateTime.now(),
          pixelRatio: pixelRatio,
          columns: columns,
        );
    await File(path).writeAsBytes(bytes);
    return true;
  }

  Future<bool> exportCompactPng({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    double pixelRatio = exportPixelRatio,
    List<ExportColumn> columns = defaultExportColumns,
  }) async {
    final location = await getSaveLocation(
      suggestedName: '${project.name}-小檔案.png',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PNG 圖片', extensions: ['png']),
      ],
    );
    if (location == null) return false;
    final path = location.path.endsWith('.png') ? location.path : '${location.path}.png';

    final bytes = await ref
        .read(imageExportServiceProvider)
        .buildCompactPng(
          project: project,
          orderedItems: orderedItems,
          scheduleResult: scheduleResult,
          today: DateTime.now(),
          pixelRatio: pixelRatio,
          columns: columns,
        );
    await File(path).writeAsBytes(bytes);
    return true;
  }

  Future<bool> exportPdf({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    PdfPageFormat pageFormat = PdfPageFormat.a4,
    double fillPercent = 100,
    List<ExportColumn> columns = defaultExportColumns,
  }) async {
    final location = await getSaveLocation(
      suggestedName: '${project.name}.pdf',
      acceptedTypeGroups: const [
        XTypeGroup(label: 'PDF 文件', extensions: ['pdf']),
      ],
    );
    if (location == null) return false;
    final path = location.path.endsWith('.pdf') ? location.path : '${location.path}.pdf';

    final bytes = await ref
        .read(pdfExportServiceProvider)
        .buildPdf(
          project: project,
          orderedItems: orderedItems,
          scheduleResult: scheduleResult,
          today: DateTime.now(),
          pageFormat: pageFormat,
          fillPercent: fillPercent,
          columns: columns,
        );
    await File(path).writeAsBytes(bytes);
    return true;
  }
}

final exportControllerProvider = Provider<ExportController>((ref) => ExportController(ref));
