import 'package:flutter_riverpod/flutter_riverpod.dart';

const minDayWidth = 12.0;
const maxDayWidth = 80.0;
const defaultDayWidth = 32.0;

/// Gantt zoom level, in memory only — resets to [defaultDayWidth] whenever
/// the schedule tab is reopened, same as reno_pm's behavior.
class ZoomNotifier extends Notifier<double> {
  @override
  double build() => defaultDayWidth;

  void zoomIn() => state = (state + 8).clamp(minDayWidth, maxDayWidth);
  void zoomOut() => state = (state - 8).clamp(minDayWidth, maxDayWidth);
  void reset() => state = defaultDayWidth;
}

final zoomDayWidthProvider = NotifierProvider<ZoomNotifier, double>(
  ZoomNotifier.new,
);
