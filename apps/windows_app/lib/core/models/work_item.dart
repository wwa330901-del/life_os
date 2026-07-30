/// A single work item (工項): pure input data. Its schedule (start/end date)
/// is never stored here or computed client-side — it always comes from the
/// backend's `/projects/:id/schedule` endpoint, so every client sees
/// identical dates. Field shape mirrors reno_pm's WorkItem (the source this
/// module's Gantt rendering was ported from) so the ported Gantt widgets
/// work unchanged against this class.
class WorkItem {
  final String id;
  final String name;

  /// Duration in working days. Must be >= 1 (enforced server-side).
  final int durationDays;

  /// 實際工期 — how many days this item actually took, tracked separately
  /// from [durationDays] (預計工期, which the schedule engine anchors off).
  /// Null until recorded. Never included in exports — see `GanttExportPainter`.
  final int? actualDurationDays;

  /// IDs of work items that must finish before this one can start.
  final List<String> predecessorIds;

  final String? tradeCategory;

  /// ARGB color value (e.g. `0xFFRRGGBB`).
  final int? colorValue;

  /// 0.0-1.0
  final double progressPercent;

  final String? notes;

  /// If set (with [isManuallyPinned]), the scheduler anchors this item's
  /// start date here instead of computing it from predecessors.
  final DateTime? manualStartDate;

  final bool isManuallyPinned;

  /// Explicit display order among siblings (independent of computed dates).
  final int sortOrder;

  /// The parent work item's id, or null for a top-level item. Whether an
  /// item is a "母項目" (summary/parent row) is derived dynamically from
  /// whether any other item points to it here — not a stored flag.
  final String? parentId;

  const WorkItem({
    required this.id,
    required this.name,
    required this.durationDays,
    this.actualDurationDays,
    this.predecessorIds = const [],
    this.tradeCategory,
    this.colorValue,
    this.progressPercent = 0.0,
    this.notes,
    this.manualStartDate,
    this.isManuallyPinned = false,
    this.sortOrder = 0,
    this.parentId,
  });

  factory WorkItem.fromJson(Map<String, dynamic> json) => WorkItem(
    id: json['id'] as String,
    name: json['name'] as String,
    durationDays: json['durationDays'] as int,
    actualDurationDays: json['actualDurationDays'] as int?,
    predecessorIds: (json['predecessorIds'] as List<dynamic>).cast<String>(),
    tradeCategory: json['tradeCategory'] as String?,
    colorValue: json['colorValue'] as int?,
    progressPercent: (json['progressPercent'] as num).toDouble(),
    notes: json['notes'] as String?,
    manualStartDate: json['manualStartDate'] == null
        ? null
        : DateTime.parse(json['manualStartDate'] as String),
    isManuallyPinned: json['isManuallyPinned'] as bool,
    sortOrder: json['sortOrder'] as int,
    parentId: json['parentId'] as String?,
  );
}
