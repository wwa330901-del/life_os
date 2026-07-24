import 'package:flutter/material.dart';

import '../../../../core/models/work_item.dart';

/// Lets the user pick which other work items this one depends on
/// (finish-to-start predecessors). Cycles aren't blocked here — the
/// scheduler detects and reports them non-fatally, so the user can fix a
/// mistake without the dialog getting in the way. Ported from reno_pm's
/// dependency_picker_dialog.dart.
class DependencyPickerDialog extends StatefulWidget {
  final WorkItem item;
  final List<WorkItem> allItems;

  const DependencyPickerDialog({
    super.key,
    required this.item,
    required this.allItems,
  });

  static Future<List<String>?> show(
    BuildContext context,
    WorkItem item,
    List<WorkItem> allItems,
  ) {
    return showDialog<List<String>>(
      context: context,
      builder: (_) => DependencyPickerDialog(item: item, allItems: allItems),
    );
  }

  @override
  State<DependencyPickerDialog> createState() => _DependencyPickerDialogState();
}

class _DependencyPickerDialogState extends State<DependencyPickerDialog> {
  late Set<String> _selected;
  String _searchText = '';

  @override
  void initState() {
    super.initState();
    _selected = widget.item.predecessorIds.toSet();
  }

  @override
  Widget build(BuildContext context) {
    final candidates = widget.allItems.where((i) => i.id != widget.item.id).toList();
    final query = _searchText.trim();
    final filtered = query.isEmpty
        ? candidates
        : candidates.where((i) => i.name.toLowerCase().contains(query.toLowerCase())).toList();

    return AlertDialog(
      title: Text('「${widget.item.name}」的前置工項'),
      content: SizedBox(
        width: 360,
        child: candidates.isEmpty
            ? const Text('目前沒有其他工項可以設定相依關係')
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    autofocus: true,
                    decoration: const InputDecoration(
                      hintText: '搜尋工項名稱…',
                      prefixIcon: Icon(Icons.search, size: 20),
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (value) => setState(() => _searchText = value),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 320,
                    child: filtered.isEmpty
                        ? const Center(child: Text('找不到符合的工項'))
                        : ListView(
                            shrinkWrap: true,
                            children: [
                              for (final candidate in filtered)
                                CheckboxListTile(
                                  dense: true,
                                  value: _selected.contains(candidate.id),
                                  title: Text(candidate.name),
                                  onChanged: (checked) {
                                    setState(() {
                                      if (checked == true) {
                                        _selected.add(candidate.id);
                                      } else {
                                        _selected.remove(candidate.id);
                                      }
                                    });
                                  },
                                ),
                            ],
                          ),
                  ),
                ],
              ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(_selected.toList()),
          child: const Text('確定'),
        ),
      ],
    );
  }
}
