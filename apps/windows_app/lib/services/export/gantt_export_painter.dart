import 'dart:isolate';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../../core/models/project.dart';
import '../../core/models/schedule_result.dart';
import '../../core/models/work_item.dart';
import '../../core/scheduling/gantt_date_range.dart';
import '../../core/theme/app_theme.dart';
import '../../ui/widgets/projects/gantt/gantt_colors.dart';
import '../../ui/widgets/projects/gantt/gantt_header_painter.dart';
import '../../ui/widgets/projects/gantt/gantt_layout.dart';
import '../../ui/widgets/projects/gantt/gantt_painter.dart';

const _titleHeight = 32.0;
const _nameColumnX = 12.0;
const _nameColumnWidth = 150.0;

/// A selectable info column shown in the task table to the left of the
/// Gantt bars, in addition to the always-present task name.
enum ExportColumn {
  startDate('開始日', 84),
  endDate('結束日', 84),
  duration('工期(天)', 64);

  final String label;
  final double width;

  const ExportColumn(this.label, this.width);
}

/// Horizontal breathing room on each side of a column's text, so adjacent
/// columns (e.g. 結束日 running straight into 工期) don't visually run into
/// each other the way they did when text was drawn flush to the column
/// boundary.
const _columnTextPadding = 6.0;

const defaultExportColumns = [ExportColumn.startDate, ExportColumn.endDate, ExportColumn.duration];

String _formatDate(DateTime d) =>
    '${d.year}/${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';

String _columnValue(ExportColumn column, WorkItem item, ScheduleResult scheduleResult) {
  switch (column) {
    case ExportColumn.startDate:
      final start = scheduleResult.byId[item.id]?.start;
      return start == null ? '' : _formatDate(start);
    case ExportColumn.endDate:
      final end = scheduleResult.byId[item.id]?.end;
      return end == null ? '' : _formatDate(end);
    case ExportColumn.duration:
      return '${item.durationDays}';
  }
}

/// Supersampling factor for exported PNG/PDF output. Drawing happens in the
/// same logical coordinates as the on-screen painters, then the whole
/// canvas is rasterized at this many physical pixels per logical pixel —
/// otherwise the export comes out visibly blurrier than the screen (e.g. a
/// 32px-wide day column has almost no room for crisp text/grid lines at 1x).
const exportPixelRatio = 4.0;

/// Renders the full (unscrolled) Gantt chart — task-name column, date
/// ruler, and bars — directly to a raster image via a standalone
/// `ui.Canvas`, reusing [GanttPainter]/[GanttHeaderPainter] for the
/// timeline itself. Deliberately does not go through the widget tree: no
/// `BuildContext`, `RepaintBoundary`, or off-screen widget mounting is
/// needed, which keeps this both simpler and independently testable.
/// Ported from reno_pm's gantt_export_painter.dart — always rendered with
/// the fixed *light* palette regardless of the app's current theme, since
/// an exported file is meant to be printed/shared, not viewed in whatever
/// dark/light mode the screen happened to be in.
Future<Uint8List> renderGanttToPngBytes({
  required Project project,
  required List<WorkItem> orderedItems,
  required ScheduleResult scheduleResult,
  required DateTime today,
  double pixelRatio = exportPixelRatio,
  List<ExportColumn> columns = defaultExportColumns,
}) async {
  final image = await _renderGanttImage(
    project: project,
    orderedItems: orderedItems,
    scheduleResult: scheduleResult,
    today: today,
    pixelRatio: pixelRatio,
    columns: columns,
  );
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  return byteData!.buffer.asUint8List();
}

const _maxResolutionSearchAttempts = 6;
const _paletteColors = 256;

/// Renders the Gantt chart to a small, lossless, color-quantized PNG whose
/// size fits under [maxBytes] — for chat-app uploads (e.g. LINE), a plain
/// image export is often too large to be treated as an inline photo rather
/// than a generic file attachment. Quantizing to a 256-color indexed
/// palette (still lossless) keeps text/gridlines crisp while shrinking the
/// file versus 32-bit truecolor; only if that still doesn't fit does this
/// fall back to reducing resolution.
///
/// The search is CPU-bound (quantizing and re-encoding a multi-megapixel
/// supersampled raster) and runs via [Isolate.run] on a background isolate
/// — doing it inline on the UI isolate would block the event loop and make
/// the window appear to hang.
Future<Uint8List> renderGanttToCompactPngBytes({
  required Project project,
  required List<WorkItem> orderedItems,
  required ScheduleResult scheduleResult,
  required DateTime today,
  double pixelRatio = exportPixelRatio,
  List<ExportColumn> columns = defaultExportColumns,
  int maxBytes = 800 * 1024,
}) async {
  final image = await _renderGanttImage(
    project: project,
    orderedItems: orderedItems,
    scheduleResult: scheduleResult,
    today: today,
    pixelRatio: pixelRatio,
    columns: columns,
  );
  final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
  final buffer = rgba!.buffer;
  final width = image.width;
  final height = image.height;

  return Isolate.run(
    () => _encodeCompactPngWithinSizeCap(
      buffer: buffer,
      width: width,
      height: height,
      maxBytes: maxBytes,
    ),
  );
}

Uint8List _encodeCompactPngWithinSizeCap({
  required ByteBuffer buffer,
  required int width,
  required int height,
  required int maxBytes,
}) {
  final fullSizeImage = img.Image.fromBytes(
    width: width,
    height: height,
    bytes: buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );

  Uint8List encode(img.Image source) {
    final quantized = img.quantize(source, numberOfColors: _paletteColors);
    return Uint8List.fromList(img.encodePng(quantized, level: 9));
  }

  var candidate = fullSizeImage;
  var bytes = encode(candidate);

  // Indexed-palette PNG compression alone usually clears the cap for
  // typical charts. sqrt(target/actual) converges resolution toward the
  // cap in a couple of steps for the rare chart still too large/detailed
  // after quantization.
  var attempts = 0;
  while (bytes.length > maxBytes && attempts < _maxResolutionSearchAttempts) {
    final scaleFactor = math.sqrt(maxBytes / bytes.length) * 0.95;
    final targetWidth = (candidate.width * scaleFactor).round();
    if (targetWidth < 200) break;
    candidate = img.copyResize(fullSizeImage, width: targetWidth);
    bytes = encode(candidate);
    attempts++;
  }

  return bytes;
}

Future<ui.Image> _renderGanttImage({
  required Project project,
  required List<WorkItem> orderedItems,
  required ScheduleResult scheduleResult,
  required DateTime today,
  double pixelRatio = exportPixelRatio,
  List<ExportColumn> columns = defaultExportColumns,
}) async {
  final colors = GanttColors.fromScheme(AppTheme.light().colorScheme);
  final range = computeGanttDateRange(
    projectStartDate: project.projectStartDate,
    scheduleResult: scheduleResult,
  );
  final ganttWidth = range.dayCount * GanttLayout.dayWidth;
  final bodyHeight = orderedItems.length * GanttLayout.rowHeight;
  final tableWidth = _nameColumnWidth + columns.fold(0.0, (sum, c) => sum + c.width);
  final totalWidth = tableWidth + ganttWidth;
  final totalHeight = _titleHeight + GanttLayout.headerHeight + bodyHeight;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, totalWidth * pixelRatio, totalHeight * pixelRatio),
  );
  canvas.scale(pixelRatio);

  canvas.drawRect(Rect.fromLTWH(0, 0, totalWidth, totalHeight), Paint()..color = Colors.white);

  _drawText(canvas, project.name, _nameColumnX, 6, totalWidth - _nameColumnX * 2, fontSize: 16, bold: true);

  canvas.save();
  canvas.translate(0, _titleHeight);
  _drawText(canvas, '工項名稱', _nameColumnX, 16, _nameColumnWidth - _nameColumnX, fontSize: 12, bold: true);
  var columnX = _nameColumnWidth;
  for (final column in columns) {
    _drawText(
      canvas,
      column.label,
      columnX + _columnTextPadding,
      16,
      column.width - _columnTextPadding * 2,
      fontSize: 12,
      bold: true,
      align: TextAlign.center,
    );
    columnX += column.width;
  }
  canvas.drawLine(
    Offset(0, GanttLayout.headerHeight - 1),
    Offset(totalWidth, GanttLayout.headerHeight - 1),
    Paint()
      ..color = const Color(0xFFE0E0E0)
      ..strokeWidth = 1,
  );
  // Vertical dividers between the name column and each info column (and
  // between the info columns themselves), so e.g. 結束日 and 工期 read as
  // distinct fields instead of running into each other.
  {
    var dividerX = _nameColumnWidth;
    final dividerBottom = GanttLayout.headerHeight + bodyHeight;
    final dividerPaint = Paint()
      ..color = const Color(0xFFE0E0E0)
      ..strokeWidth = 1;
    canvas.drawLine(Offset(dividerX, 0), Offset(dividerX, dividerBottom), dividerPaint);
    for (final column in columns) {
      dividerX += column.width;
      canvas.drawLine(Offset(dividerX, 0), Offset(dividerX, dividerBottom), dividerPaint);
    }
  }
  canvas.save();
  canvas.translate(tableWidth, 0);
  GanttHeaderPainter(
    timelineStart: range.start,
    dayCount: range.dayCount,
    calendar: project.calendar,
    colors: colors,
  ).paint(canvas, Size(ganttWidth, GanttLayout.headerHeight));
  canvas.restore();
  canvas.restore();

  canvas.save();
  canvas.translate(0, _titleHeight + GanttLayout.headerHeight);
  for (var i = 0; i < orderedItems.length; i++) {
    final item = orderedItems[i];
    final y = i * GanttLayout.rowHeight;
    _drawText(canvas, item.name, _nameColumnX, y + 12, _nameColumnWidth - _nameColumnX, fontSize: 13);
    var rowColumnX = _nameColumnWidth;
    for (final column in columns) {
      _drawText(
        canvas,
        _columnValue(column, item, scheduleResult),
        rowColumnX + _columnTextPadding,
        y + 12,
        column.width - _columnTextPadding * 2,
        fontSize: 13,
        align: TextAlign.center,
      );
      rowColumnX += column.width;
    }
    canvas.drawLine(
      Offset(0, y + GanttLayout.rowHeight - 1),
      Offset(totalWidth, y + GanttLayout.rowHeight - 1),
      Paint()
        ..color = const Color(0xFFF0F0F0)
        ..strokeWidth = 1,
    );
  }
  canvas.save();
  canvas.translate(tableWidth, 0);
  GanttPainter(
    orderedItems: orderedItems,
    scheduleResult: scheduleResult,
    calendar: project.calendar,
    timelineStart: range.start,
    dayCount: range.dayCount,
    today: today,
    colors: colors,
  ).paint(canvas, Size(ganttWidth, bodyHeight));
  canvas.restore();
  canvas.restore();

  final picture = recorder.endRecording();
  return picture.toImage((totalWidth * pixelRatio).ceil(), (totalHeight * pixelRatio).ceil());
}

void _drawText(
  Canvas canvas,
  String text,
  double x,
  double y,
  double maxWidth, {
  double fontSize = 12,
  bool bold = false,
  TextAlign align = TextAlign.left,
}) {
  final painter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(
        fontSize: fontSize,
        color: Colors.black87,
        fontWeight: bold ? FontWeight.bold : FontWeight.normal,
      ),
    ),
    textDirection: TextDirection.ltr,
    textAlign: align,
    maxLines: 1,
    ellipsis: '…',
  )..layout(maxWidth: maxWidth < 0 ? 0 : maxWidth);
  painter.paint(canvas, Offset(x, y));
}
