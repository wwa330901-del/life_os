import 'package:collection/collection.dart';
import 'package:flutter/material.dart';

import '../../../../core/models/work_item.dart';
import '../../../../core/models/work_item_hierarchy.dart';
import '../gantt/gantt_colors.dart';
import '../gantt/gantt_layout.dart';
import '../gantt/gantt_painter.dart';
import '../gantt/linked_scroll_controllers.dart';
import 'dependency_picker_dialog.dart';

const _indentWidth = 18.0;
const _minColumnWidth = 40.0;
const _minNameWidth = 100.0;

/// Width of everything a body row renders before its name column (16
/// drag-handle icon + 18 collapse-toggle slot + 4 color bar + 8 spacer —
/// depth indent lives *inside* the name column itself, see `_TaskRowState`,
/// so this gutter is the same at every nesting depth). The header has no
/// drag handle/toggle/color bar of its own, so it reserves this same width
/// as blank space to keep 工項名稱 and every column after it lined up with
/// the actual row content below.
const _leadingGutterWidth = 16.0 + 18.0 + 4.0 + 8.0;

/// Column widths for the five data columns — plain mutable fields (not a
/// provider/state object) since this is purely this table's own render
/// state, mutated via `setState` in `_TaskTableState` and read by every
/// `_TaskRow` so header and data rows always stay pixel-aligned.
class _ColumnWidths {
  double name = 200;
  double startDate = 88;
  double endDate = 80;
  double duration = 56;
  double actualDuration = 56;
  double predecessor = 60;
}

/// A thin draggable seam between two header columns. Dragging only grows/
/// shrinks the column to its left — this is a plain horizontally-scrollable
/// row of fixed-width cells, not a constrained flex layout, so there's
/// nothing on the right that needs to shrink to compensate.
class _ColumnResizeHandle extends StatelessWidget {
  const _ColumnResizeHandle({required this.onDrag});

  final ValueChanged<double> onDrag;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return MouseRegion(
      cursor: SystemMouseCursors.resizeLeftRight,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onHorizontalDragUpdate: (details) => onDrag(details.delta.dx),
        child: SizedBox(
          height: GanttLayout.headerHeight,
          width: 9,
          child: Center(
            child: Container(width: 1, color: scheme.outline.withValues(alpha: 0.4)),
          ),
        ),
      ),
    );
  }
}

/// Left-hand pane of the 工期 tab: an editable, tree-indented task list kept
/// row-aligned with the Gantt canvas beside it. Ported from reno_pm's
/// task_table.dart — restyled to read colors from the theme (not a fixed
/// light-mode palette), to commit text edits on submit/blur rather than
/// every keystroke (each edit here is a network write, not a synchronous
/// local state update), and each column's width is independently
/// draggable — the whole header+body scrolls horizontally together
/// (`LinkedScrollControllers`, same pattern `GanttTimeline` uses for its
/// own header/body split) once the columns are wider than the pane.
class TaskTable extends StatefulWidget {
  /// Depth-first flattened tree, respecting the caller's collapse state —
  /// row `i` here must line up with row `i` of the Gantt canvas.
  final List<FlatTreeItem> flatTree;
  final ScrollController verticalController;
  final String? selectedItemId;
  final Set<String> issueItemIds;
  final Set<String> collapsedIds;

  /// The scheduler's computed/aggregated start date per item.
  final Map<String, DateTime> computedStartDates;

  /// The scheduler's computed end date per item. Picking a different end
  /// date back-derives a new duration (see [onEndDateChanged]).
  final Map<String, DateTime> computedEndDates;
  final ValueChanged<String>? onSelectItem;
  final void Function(String id, String name) onNameChanged;

  /// [date] is null to clear a pin and revert to the auto-computed date.
  final void Function(String id, DateTime? date) onStartDateChanged;
  final void Function(String id, int durationDays) onDurationChanged;

  /// `days` null clears 實際工期.
  final void Function(String id, int? days) onActualDurationChanged;
  final void Function(String id, DateTime endDate) onEndDateChanged;
  final void Function(String id, List<String> predecessorIds) onPredecessorsChanged;
  final void Function(String id) onDelete;
  final void Function(String id) onToggleCollapse;
  final VoidCallback onAdd;
  final void Function(String parentId) onAddChild;
  final void Function(String draggedId, String targetId, {bool insertAfter}) onReorder;

  const TaskTable({
    super.key,
    required this.flatTree,
    required this.verticalController,
    required this.onNameChanged,
    required this.onStartDateChanged,
    required this.onDurationChanged,
    required this.onActualDurationChanged,
    required this.onEndDateChanged,
    required this.onPredecessorsChanged,
    required this.onDelete,
    required this.onAdd,
    required this.onAddChild,
    required this.onToggleCollapse,
    required this.onReorder,
    this.computedStartDates = const {},
    this.computedEndDates = const {},
    this.issueItemIds = const {},
    this.collapsedIds = const {},
    this.selectedItemId,
    this.onSelectItem,
  });

  @override
  State<TaskTable> createState() => _TaskTableState();
}

class _TaskTableState extends State<TaskTable> {
  final _ColumnWidths _widths = _ColumnWidths();
  final LinkedScrollControllers _horizontal = LinkedScrollControllers();

  @override
  void dispose() {
    _horizontal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final allItems = widget.flatTree.map((f) => f.item).toList();
    final palette = GanttColors.fromScheme(scheme).palette;
    final headerStyle = TextStyle(
      fontWeight: FontWeight.w600,
      fontSize: 12,
      color: scheme.onSurface.withValues(alpha: 0.7),
    );

    return Column(
      children: [
        Container(
          height: GanttLayout.headerHeight,
          decoration: BoxDecoration(
            color: scheme.surface,
            border: Border(bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.3))),
          ),
          child: SingleChildScrollView(
            controller: _horizontal.first,
            scrollDirection: Axis.horizontal,
            physics: const ClampingScrollPhysics(),
            child: Row(
              children: [
                const SizedBox(width: _leadingGutterWidth),
                SizedBox(
                  width: _widths.name,
                  child: Text('工項名稱', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.name = (_widths.name + dx).clamp(_minNameWidth, double.infinity),
                  ),
                ),
                SizedBox(
                  width: _widths.startDate,
                  child: Text('起始日', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.startDate = (_widths.startDate + dx).clamp(_minColumnWidth, double.infinity),
                  ),
                ),
                SizedBox(
                  width: _widths.endDate,
                  child: Text('結束日', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.endDate = (_widths.endDate + dx).clamp(_minColumnWidth, double.infinity),
                  ),
                ),
                SizedBox(
                  width: _widths.duration,
                  child: Text('工期(天)', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.duration = (_widths.duration + dx).clamp(_minColumnWidth, double.infinity),
                  ),
                ),
                SizedBox(
                  width: _widths.actualDuration,
                  child: Text('實際工期(天)', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.actualDuration = (_widths.actualDuration + dx).clamp(
                      _minColumnWidth,
                      double.infinity,
                    ),
                  ),
                ),
                SizedBox(
                  width: _widths.predecessor,
                  child: Text('相依', textAlign: TextAlign.center, style: headerStyle),
                ),
                _ColumnResizeHandle(
                  onDrag: (dx) => setState(
                    () => _widths.predecessor = (_widths.predecessor + dx).clamp(_minColumnWidth, double.infinity),
                  ),
                ),
                const SizedBox(width: 32),
                const SizedBox(width: 40),
              ],
            ),
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            controller: widget.verticalController,
            child: SingleChildScrollView(
              controller: _horizontal.second,
              scrollDirection: Axis.horizontal,
              physics: const ClampingScrollPhysics(),
              child: Column(
                children: [
                  for (final node in widget.flatTree)
                    _TaskRow(
                      key: ValueKey(node.item.id),
                      item: node.item,
                      allItems: allItems,
                      palette: palette,
                      widths: _widths,
                      depth: node.depth,
                      hasChildren: node.hasChildren,
                      isCollapsed: widget.collapsedIds.contains(node.item.id),
                      selected: node.item.id == widget.selectedItemId,
                      hasIssue: widget.issueItemIds.contains(node.item.id),
                      computedStartDate: widget.computedStartDates[node.item.id],
                      computedEndDate: widget.computedEndDates[node.item.id],
                      onTap: () => widget.onSelectItem?.call(node.item.id),
                      onNameChanged: (name) => widget.onNameChanged(node.item.id, name),
                      onStartDateChanged: (date) => widget.onStartDateChanged(node.item.id, date),
                      onDurationChanged: (d) => widget.onDurationChanged(node.item.id, d),
                      onActualDurationChanged: (d) => widget.onActualDurationChanged(node.item.id, d),
                      onEndDateChanged: (date) => widget.onEndDateChanged(node.item.id, date),
                      onPredecessorsChanged: (ids) => widget.onPredecessorsChanged(node.item.id, ids),
                      onDelete: () => widget.onDelete(node.item.id),
                      onToggleCollapse: () => widget.onToggleCollapse(node.item.id),
                      onAddChild: () => widget.onAddChild(node.item.id),
                      onReorder: widget.onReorder,
                    ),
                  SizedBox(
                    height: GanttLayout.rowHeight,
                    child: TextButton.icon(
                      onPressed: widget.onAdd,
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('新增工項'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TaskRow extends StatefulWidget {
  final WorkItem item;
  final List<WorkItem> allItems;
  final List<Color> palette;
  final _ColumnWidths widths;
  final int depth;
  final bool hasChildren;
  final bool isCollapsed;
  final bool selected;
  final bool hasIssue;
  final DateTime? computedStartDate;
  final DateTime? computedEndDate;
  final VoidCallback onTap;
  final ValueChanged<String> onNameChanged;
  final ValueChanged<DateTime?> onStartDateChanged;
  final ValueChanged<int> onDurationChanged;
  final ValueChanged<int?> onActualDurationChanged;
  final ValueChanged<DateTime> onEndDateChanged;
  final ValueChanged<List<String>> onPredecessorsChanged;
  final VoidCallback onDelete;
  final VoidCallback onToggleCollapse;
  final VoidCallback onAddChild;
  final void Function(String draggedId, String targetId, {bool insertAfter}) onReorder;

  const _TaskRow({
    super.key,
    required this.item,
    required this.allItems,
    required this.palette,
    required this.widths,
    required this.depth,
    required this.hasChildren,
    required this.isCollapsed,
    required this.selected,
    required this.hasIssue,
    required this.onTap,
    required this.onNameChanged,
    required this.onStartDateChanged,
    required this.onDurationChanged,
    required this.onActualDurationChanged,
    required this.onEndDateChanged,
    required this.onPredecessorsChanged,
    required this.onDelete,
    required this.onToggleCollapse,
    required this.onAddChild,
    required this.onReorder,
    this.computedStartDate,
    this.computedEndDate,
  });

  @override
  State<_TaskRow> createState() => _TaskRowState();
}

class _TaskRowState extends State<_TaskRow> {
  late final TextEditingController _nameController;
  late final TextEditingController _durationController;
  late final TextEditingController _actualDurationController;
  final FocusNode _nameFocusNode = FocusNode();
  final FocusNode _durationFocusNode = FocusNode();
  final FocusNode _actualDurationFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.item.name);
    _durationController = TextEditingController(text: widget.item.durationDays.toString());
    _actualDurationController = TextEditingController(
      text: widget.item.actualDurationDays?.toString() ?? '',
    );
    _nameFocusNode.addListener(_commitNameOnBlur);
    _durationFocusNode.addListener(_commitDurationOnBlur);
    _actualDurationFocusNode.addListener(_commitActualDurationOnBlur);
  }

  void _commitNameOnBlur() {
    if (_nameFocusNode.hasFocus) return;
    final text = _nameController.text.trim();
    if (text.isNotEmpty && text != widget.item.name) {
      widget.onNameChanged(text);
    } else {
      _nameController.text = widget.item.name;
    }
  }

  void _commitDurationOnBlur() {
    if (_durationFocusNode.hasFocus) return;
    final parsed = int.tryParse(_durationController.text);
    if (parsed != null && parsed >= 1 && parsed != widget.item.durationDays) {
      widget.onDurationChanged(parsed);
    } else {
      _durationController.text = widget.item.durationDays.toString();
    }
  }

  void _commitActualDurationOnBlur() {
    if (_actualDurationFocusNode.hasFocus) return;
    final text = _actualDurationController.text.trim();
    if (text.isEmpty) {
      if (widget.item.actualDurationDays != null) widget.onActualDurationChanged(null);
      return;
    }
    final parsed = int.tryParse(text);
    if (parsed != null && parsed >= 0 && parsed != widget.item.actualDurationDays) {
      widget.onActualDurationChanged(parsed);
    } else {
      _actualDurationController.text = widget.item.actualDurationDays?.toString() ?? '';
    }
  }

  @override
  void didUpdateWidget(covariant _TaskRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.item.name != _nameController.text && !_nameFocusNode.hasFocus) {
      _nameController.text = widget.item.name;
    }
    final durationText = widget.item.durationDays.toString();
    if (durationText != _durationController.text && !_durationFocusNode.hasFocus) {
      _durationController.text = durationText;
    }
    final actualDurationText = widget.item.actualDurationDays?.toString() ?? '';
    if (actualDurationText != _actualDurationController.text && !_actualDurationFocusNode.hasFocus) {
      _actualDurationController.text = actualDurationText;
    }
  }

  /// null when nothing is hovering over this row; otherwise which edge a
  /// valid drop would insert next to, for the insertion-line indicator.
  bool? _hoverInsertAfter;

  bool _canAcceptDrag(String draggedId) {
    if (draggedId == widget.item.id) return false;
    final dragged = widget.allItems.where((i) => i.id == draggedId).firstOrNull;
    return dragged != null && dragged.parentId == widget.item.parentId;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _durationController.dispose();
    _actualDurationController.dispose();
    _nameFocusNode.dispose();
    _durationFocusNode.dispose();
    _actualDurationFocusNode.dispose();
    super.dispose();
  }

  Future<void> _openDependencyPicker() async {
    final result = await DependencyPickerDialog.show(context, widget.item, widget.allItems);
    if (result != null) {
      widget.onPredecessorsChanged(result);
    }
  }

  Future<void> _pickStartDate() async {
    final initial = widget.item.manualStartDate ?? widget.computedStartDate ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    widget.onStartDateChanged(DateTime(picked.year, picked.month, picked.day));
  }

  Future<void> _pickEndDate() async {
    final effectiveStart = widget.item.manualStartDate ?? widget.computedStartDate ?? DateTime.now();
    final initial = widget.computedEndDate ?? effectiveStart;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(effectiveStart) ? effectiveStart : initial,
      firstDate: effectiveStart,
      lastDate: DateTime(2100),
    );
    if (picked == null) return;
    widget.onEndDateChanged(DateTime(picked.year, picked.month, picked.day));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final mutedText = scheme.onSurface.withValues(alpha: 0.55);
    final faintText = scheme.onSurface.withValues(alpha: 0.35);
    final widths = widget.widths;

    final isParentRow = widget.hasChildren;
    final color = colorForItem(widget.item, widget.allItems, widget.palette);
    final predecessorNames = widget.item.predecessorIds
        .map((id) => widget.allItems.where((i) => i.id == id).firstOrNull?.name)
        .whereType<String>()
        .join('、');

    final isPinned =
        !isParentRow && widget.item.isManuallyPinned && widget.item.manualStartDate != null;
    final displayDate = isParentRow
        ? widget.computedStartDate
        : (widget.item.manualStartDate ?? widget.computedStartDate);
    final dateLabel = displayDate == null ? '--/--' : '${displayDate.month}/${displayDate.day}';

    final rowContent = GestureDetector(
      onTap: widget.onTap,
      child: Container(
        height: GanttLayout.rowHeight,
        decoration: BoxDecoration(
          color: widget.selected ? scheme.primary.withValues(alpha: 0.12) : scheme.surface,
          border: Border(
            bottom: BorderSide(color: scheme.outline.withValues(alpha: 0.15)),
            left: widget.hasIssue
                ? BorderSide(color: scheme.error, width: 3)
                : BorderSide.none,
          ),
        ),
        child: Row(
          children: [
            Draggable<String>(
              data: widget.item.id,
              feedback: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 240),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Text(
                    widget.item.name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
              ),
              childWhenDragging: Icon(Icons.drag_indicator, size: 16, color: faintText),
              child: Icon(Icons.drag_indicator, size: 16, color: mutedText),
            ),
            SizedBox(
              width: 18,
              child: widget.hasChildren
                  ? InkWell(
                      onTap: widget.onToggleCollapse,
                      child: Icon(
                        widget.isCollapsed ? Icons.chevron_right : Icons.expand_more,
                        size: 16,
                      ),
                    )
                  : null,
            ),
            Container(width: 4, height: 20, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 8),
            // The depth indent lives *inside* this fixed-width box (rather
            // than as a preceding sibling in the row) so the box's own
            // width — and therefore every column after it — stays constant
            // across depths. Indenting via a sibling would grow each
            // nested row's total width by `depth * _indentWidth`, pushing
            // 起始日/結束日/工期/相依 further right the deeper an item is
            // nested, so child rows no longer lined up with their parent's.
            SizedBox(
              width: widths.name,
              child: Row(
                children: [
                  SizedBox(width: widget.depth * _indentWidth),
                  Expanded(
                    child: TextField(
                      controller: _nameController,
                      focusNode: _nameFocusNode,
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: isParentRow ? FontWeight.w600 : FontWeight.normal,
                      ),
                      onSubmitted: (_) => _nameFocusNode.unfocus(),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: widths.startDate,
              child: isParentRow
                  ? Text(dateLabel, style: TextStyle(fontSize: 12, color: mutedText))
                  : Tooltip(
                      message: isPinned ? '手動指定起始日(點兩下可改回自動)' : '自動依相依關係計算,點擊可手動指定',
                      child: InkWell(
                        onTap: _pickStartDate,
                        onDoubleTap: isPinned ? () => widget.onStartDateChanged(null) : null,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (isPinned)
                              Padding(
                                padding: const EdgeInsets.only(right: 2),
                                child: Icon(Icons.push_pin, size: 11, color: scheme.primary),
                              ),
                            Text(
                              dateLabel,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: isPinned ? FontWeight.w600 : FontWeight.normal,
                                color: isPinned ? scheme.onSurface : mutedText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: widths.endDate,
              child: isParentRow
                  ? Text(
                      widget.computedEndDate == null
                          ? '--/--'
                          : '${widget.computedEndDate!.month}/${widget.computedEndDate!.day}',
                      style: TextStyle(fontSize: 12, color: mutedText),
                    )
                  : Tooltip(
                      message: '點擊選擇結束日,工期會自動依公休日曆重新計算',
                      child: InkWell(
                        onTap: _pickEndDate,
                        child: Text(
                          widget.computedEndDate == null
                              ? '--/--'
                              : '${widget.computedEndDate!.month}/${widget.computedEndDate!.day}',
                          style: TextStyle(fontSize: 12, color: mutedText),
                        ),
                      ),
                    ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: widths.duration,
              child: isParentRow
                  ? Text('—', style: TextStyle(fontSize: 13, color: faintText))
                  : TextField(
                      controller: _durationController,
                      focusNode: _durationFocusNode,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      style: const TextStyle(fontSize: 13),
                      onSubmitted: (_) => _durationFocusNode.unfocus(),
                    ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: widths.actualDuration,
              child: isParentRow
                  ? Text('—', style: TextStyle(fontSize: 13, color: faintText))
                  : TextField(
                      controller: _actualDurationController,
                      focusNode: _actualDurationFocusNode,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                        hintText: '—',
                        hintStyle: TextStyle(fontSize: 13, color: faintText),
                      ),
                      style: const TextStyle(fontSize: 13),
                      onSubmitted: (_) => _actualDurationFocusNode.unfocus(),
                    ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: widths.predecessor,
              child: isParentRow
                  ? Text('—', style: TextStyle(fontSize: 13, color: faintText))
                  : Tooltip(
                      message: predecessorNames.isEmpty ? '未設定前置工項' : '前置: $predecessorNames',
                      child: TextButton(
                        onPressed: _openDependencyPicker,
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: const Size(40, 28),
                          alignment: Alignment.centerLeft,
                          foregroundColor: widget.hasIssue ? scheme.error : null,
                        ),
                        child: Text(
                          widget.item.predecessorIds.isEmpty
                              ? '設定'
                              : '${widget.item.predecessorIds.length} 項',
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ),
            ),
            const SizedBox(width: 9),
            SizedBox(
              width: 32,
              child: IconButton(
                icon: const Icon(Icons.subdirectory_arrow_right, size: 15),
                onPressed: widget.onAddChild,
                tooltip: '新增子項目',
                padding: EdgeInsets.zero,
              ),
            ),
            SizedBox(
              width: 40,
              child: IconButton(
                icon: const Icon(Icons.close, size: 16),
                onPressed: widget.onDelete,
                tooltip: isParentRow ? '刪除工項(含所有子項目)' : '刪除工項',
              ),
            ),
          ],
        ),
      ),
    );

    return Stack(
      children: [
        rowContent,
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: GanttLayout.rowHeight / 2,
          child: DragTarget<String>(
            onWillAcceptWithDetails: (details) => _canAcceptDrag(details.data),
            onMove: (_) => setState(() => _hoverInsertAfter = false),
            onLeave: (_) => setState(() => _hoverInsertAfter = null),
            onAcceptWithDetails: (details) {
              widget.onReorder(details.data, widget.item.id, insertAfter: false);
              setState(() => _hoverInsertAfter = null);
            },
            builder: (context, candidateData, rejectedData) => const SizedBox.expand(),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: GanttLayout.rowHeight / 2,
          child: DragTarget<String>(
            onWillAcceptWithDetails: (details) => _canAcceptDrag(details.data),
            onMove: (_) => setState(() => _hoverInsertAfter = true),
            onLeave: (_) => setState(() => _hoverInsertAfter = null),
            onAcceptWithDetails: (details) {
              widget.onReorder(details.data, widget.item.id, insertAfter: true);
              setState(() => _hoverInsertAfter = null);
            },
            builder: (context, candidateData, rejectedData) => const SizedBox.expand(),
          ),
        ),
        if (_hoverInsertAfter != null)
          Positioned(
            left: 0,
            right: 0,
            top: _hoverInsertAfter! ? null : 0,
            bottom: _hoverInsertAfter! ? 0 : null,
            child: IgnorePointer(
              child: Container(height: 2, color: scheme.primary),
            ),
          ),
      ],
    );
  }
}
