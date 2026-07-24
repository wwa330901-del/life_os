import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/schedule_result.dart';
import '../../../../core/models/work_item_hierarchy.dart';
import '../../../../state/project_editor_provider.dart';
import '../../../widgets/projects/gantt/gantt_layout.dart';
import '../../../widgets/projects/gantt/gantt_timeline.dart';
import '../../../widgets/projects/gantt/linked_scroll_controllers.dart';

/// 工期 tab: a read-only task list (left) next to the ported Gantt chart
/// (right), sharing vertical scroll so rows stay aligned — same split-pane
/// shape as reno_pm's project_editor_screen.dart, minus every editing
/// affordance (that's Phase 4). Dates shown here always come from the
/// server's computed schedule, never from local arithmetic.
class ScheduleTab extends ConsumerStatefulWidget {
  const ScheduleTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends ConsumerState<ScheduleTab> {
  final LinkedScrollControllers _vertical = LinkedScrollControllers();
  String? _selectedItemId;

  @override
  void dispose() {
    _vertical.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final editorAsync = ref.watch(projectEditorProvider(widget.projectId));

    return editorAsync.when(
      data: (editor) {
        final flatTree = flattenTree(editor.items);
        final orderedItems = flatTree.map((f) => f.item).toList();

        return Column(
          children: [
            if (editor.schedule.hasIssues) _IssuesBanner(schedule: editor.schedule),
            Expanded(
              child: orderedItems.isEmpty
                  ? const Center(child: Text('尚未新增工項'))
                  : Row(
                      children: [
                        SizedBox(
                          width: 420,
                          child: _TaskList(
                            flatTree: flatTree,
                            schedule: editor.schedule,
                            verticalController: _vertical.first,
                            selectedItemId: _selectedItemId,
                            onSelectItem: (id) => setState(() => _selectedItemId = id),
                          ),
                        ),
                        const VerticalDivider(width: 1),
                        Expanded(
                          child: GanttTimeline(
                            orderedItems: orderedItems,
                            scheduleResult: editor.schedule,
                            calendar: editor.project.calendar,
                            projectStartDate: editor.project.projectStartDate,
                            verticalController: _vertical.second,
                            selectedItemId: _selectedItemId,
                            onSelectItem: (id) => setState(() => _selectedItemId = id),
                          ),
                        ),
                      ],
                    ),
            ),
          ],
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取工期資料失敗：$error')),
    );
  }
}

class _IssuesBanner extends StatelessWidget {
  const _IssuesBanner({required this.schedule});

  final ScheduleResult schedule;

  @override
  Widget build(BuildContext context) {
    return MaterialBanner(
      leading: const Icon(Icons.warning_amber_rounded, color: Colors.orange),
      content: Text(schedule.issues.map((i) => i.message).join('\n')),
      actions: const [SizedBox.shrink()],
    );
  }
}

class _TaskList extends StatelessWidget {
  const _TaskList({
    required this.flatTree,
    required this.schedule,
    required this.verticalController,
    required this.selectedItemId,
    required this.onSelectItem,
  });

  final List<FlatTreeItem> flatTree;
  final ScheduleResult schedule;
  final ScrollController verticalController;
  final String? selectedItemId;
  final ValueChanged<String> onSelectItem;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.builder(
      controller: verticalController,
      itemCount: flatTree.length,
      itemExtent: GanttLayout.rowHeight,
      itemBuilder: (context, index) {
        final row = flatTree[index];
        final item = row.item;
        final scheduled = schedule.byId[item.id];
        final selected = item.id == selectedItemId;

        return InkWell(
          onTap: () => onSelectItem(item.id),
          child: Container(
            color: selected ? scheme.primary.withValues(alpha: 0.12) : null,
            padding: EdgeInsets.only(left: 12.0 + row.depth * 20, right: 12),
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Text(
                    item.name,
                    style: TextStyle(
                      fontWeight: row.hasChildren ? FontWeight.w600 : FontWeight.normal,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Expanded(
                  flex: 1,
                  child: Text('${item.durationDays} 天', textAlign: TextAlign.right),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    scheduled == null ? '—' : _formatDate(scheduled.start),
                    textAlign: TextAlign.right,
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Text(
                    scheduled == null ? '—' : _formatDate(scheduled.end),
                    textAlign: TextAlign.right,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatDate(DateTime date) => '${date.month}/${date.day}';
}
