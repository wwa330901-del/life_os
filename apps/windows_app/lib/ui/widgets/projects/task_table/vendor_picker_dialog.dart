import 'package:flutter/material.dart';

import '../../../../core/models/engineering_finance.dart';

/// Lets the user pick which of this space's vendors are assigned to a work
/// item (2026-09 多工項對多廠商結構) — pure schedule-side metadata, kept
/// deliberately separate from 成控表/採發比價表's own vendor selection (see
/// `WorkItemVendor` in schema.prisma). Same shape as
/// `DependencyPickerDialog`, picking from `Vendor` instead of `WorkItem`.
class VendorPickerDialog extends StatefulWidget {
  final List<String> selectedVendorIds;
  final List<Vendor> allVendors;

  const VendorPickerDialog({
    super.key,
    required this.selectedVendorIds,
    required this.allVendors,
  });

  static Future<List<String>?> show(
    BuildContext context,
    List<String> selectedVendorIds,
    List<Vendor> allVendors,
  ) {
    return showDialog<List<String>>(
      context: context,
      builder: (_) =>
          VendorPickerDialog(selectedVendorIds: selectedVendorIds, allVendors: allVendors),
    );
  }

  @override
  State<VendorPickerDialog> createState() => _VendorPickerDialogState();
}

class _VendorPickerDialogState extends State<VendorPickerDialog> {
  late Set<String> _selected;
  String _searchText = '';

  @override
  void initState() {
    super.initState();
    _selected = widget.selectedVendorIds.toSet();
  }

  @override
  Widget build(BuildContext context) {
    final query = _searchText.trim();
    final filtered = query.isEmpty
        ? widget.allVendors
        : widget.allVendors
              .where((v) => v.name.toLowerCase().contains(query.toLowerCase()))
              .toList();

    return AlertDialog(
      title: const Text('負責廠商'),
      content: SizedBox(
        width: 360,
        child: widget.allVendors.isEmpty
            ? const Text('這個空間還沒有廠商資料，請先到「廠商管理」新增')
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    autofocus: true,
                    decoration: const InputDecoration(
                      hintText: '搜尋廠商名稱…',
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
                        ? const Center(child: Text('找不到符合的廠商'))
                        : ListView(
                            shrinkWrap: true,
                            children: [
                              for (final vendor in filtered)
                                CheckboxListTile(
                                  dense: true,
                                  value: _selected.contains(vendor.id),
                                  title: Text(vendor.name),
                                  subtitle: vendor.tradeCategory == null
                                      ? null
                                      : Text(vendor.tradeCategory!),
                                  onChanged: (checked) {
                                    setState(() {
                                      if (checked == true) {
                                        _selected.add(vendor.id);
                                      } else {
                                        _selected.remove(vendor.id);
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
