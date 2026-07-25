import 'dart:typed_data';

import '../../core/models/project.dart';
import '../../core/models/schedule_result.dart';
import '../../core/models/work_item.dart';
import 'gantt_export_painter.dart';

class ImageExportService {
  Future<Uint8List> buildPng({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    required DateTime today,
    double pixelRatio = exportPixelRatio,
    List<ExportColumn> columns = defaultExportColumns,
  }) {
    return renderGanttToPngBytes(
      project: project,
      orderedItems: orderedItems,
      scheduleResult: scheduleResult,
      today: today,
      pixelRatio: pixelRatio,
      columns: columns,
    );
  }

  Future<Uint8List> buildCompactPng({
    required Project project,
    required List<WorkItem> orderedItems,
    required ScheduleResult scheduleResult,
    required DateTime today,
    double pixelRatio = exportPixelRatio,
    List<ExportColumn> columns = defaultExportColumns,
  }) {
    return renderGanttToCompactPngBytes(
      project: project,
      orderedItems: orderedItems,
      scheduleResult: scheduleResult,
      today: today,
      pixelRatio: pixelRatio,
      columns: columns,
    );
  }
}
