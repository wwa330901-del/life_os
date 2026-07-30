import 'package:flutter/material.dart';

/// Theme-derived colors for the Gantt chart, so it reads as part of 元序's
/// warm, quiet visual language instead of a fixed light-mode palette pasted
/// on top of it. The 8-hue task-bar palette is a validated categorical set
/// (OKLCH lightness/chroma-floor/CVD-separation checks, both light and dark
/// surface) built from the app's own brand hue family rather than the
/// saturated placeholder colors reno_pm used — see the dataviz skill's
/// validator. Each hue stays legible with the direct name label already
/// printed beside every bar (the required secondary encoding for the one
/// adjacent pair that only clears the floor band, not the full target).
class GanttColors {
  const GanttColors({
    required this.canvasBackground,
    required this.gridLine,
    required this.offDayShade,
    required this.textPrimary,
    required this.textMuted,
    required this.todayMarker,
    required this.summaryBar,
    required this.selectionOutline,
    required this.dependencyArrow,
    required this.actualBar,
    required this.palette,
  });

  final Color canvasBackground;
  final Color gridLine;
  final Color offDayShade;
  final Color textPrimary;
  final Color textMuted;
  final Color todayMarker;
  final Color summaryBar;
  final Color selectionOutline;
  final Color dependencyArrow;

  /// The 實際工期 comparison strip drawn under a bar — the app's warm gold
  /// brand accent (same family as the LINE rich menu / app icon), chosen so
  /// it reads as "annotation" rather than being mistaken for one more
  /// category in [palette].
  final Color actualBar;

  /// Fixed order, never cycled by value — each top-level branch gets the
  /// next slot the first time it appears.
  final List<Color> palette;

  factory GanttColors.fromScheme(ColorScheme scheme) {
    return GanttColors(
      canvasBackground: scheme.surface,
      gridLine: scheme.outline.withValues(alpha: 0.28),
      offDayShade: scheme.outline.withValues(alpha: 0.12),
      textPrimary: scheme.onSurface,
      textMuted: scheme.onSurface.withValues(alpha: 0.6),
      todayMarker: scheme.error,
      summaryBar: scheme.onSurface.withValues(alpha: 0.75),
      selectionOutline: scheme.onSurface,
      dependencyArrow: scheme.outline,
      actualBar: const Color(0xFFD8B88A),
      palette: const [
        Color(0xFF4781CC), // muted blue
        Color(0xFFC0623F), // muted terracotta
        Color(0xFF079868), // muted teal-green
        Color(0xFFAD7300), // muted ochre
        Color(0xFFBC5C81), // muted rose
        Color(0xFF4D9348), // muted moss
        Color(0xFF7774CB), // muted violet
        Color(0xFFC25D58), // muted brick red
      ],
    );
  }
}
