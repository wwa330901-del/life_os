import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/models/project.dart';
import '../../../state/auth_provider.dart';
import '../../../state/project_options_provider.dart';
import '../../../state/projects_provider.dart';

/// 業主名稱/專案地點/類型/狀態 are required; 案號 is the only optional field.
/// 專案名稱 auto-fills as 業主名稱+專案地點+類型 while the user hasn't typed
/// their own value into it — a convenience, not a lock, so it stays a plain
/// editable field the whole time.
class CreateProjectDialog extends ConsumerStatefulWidget {
  const CreateProjectDialog({super.key, required this.spaceId});

  final String spaceId;

  static Future<bool> show(BuildContext context, String spaceId) async {
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => CreateProjectDialog(spaceId: spaceId),
    );
    return created ?? false;
  }

  @override
  ConsumerState<CreateProjectDialog> createState() => _CreateProjectDialogState();
}

class _CreateProjectDialogState extends ConsumerState<CreateProjectDialog> {
  final _nameController = TextEditingController();
  final _clientController = TextEditingController();
  final _addressController = TextEditingController();
  final _caseNumberController = TextEditingController();
  String _lastAutoName = '';
  String? _typeId;
  String? _statusId;
  var _startDate = DateTime.now();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _clientController.addListener(_recomputeName);
    _addressController.addListener(_recomputeName);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _clientController.dispose();
    _addressController.dispose();
    _caseNumberController.dispose();
    super.dispose();
  }

  void _recomputeName([List<ProjectOption>? typeOptions]) {
    final typeLabel = typeOptions?.firstWhereOrNull((o) => o.id == _typeId)?.label ?? '';
    final auto = '${_clientController.text}${_addressController.text}$typeLabel';
    // Only overwrite the name field if it still holds the last auto-generated
    // value — once the user types their own text in, it stops following.
    if (_nameController.text == _lastAutoName) {
      _nameController.text = auto;
    }
    _lastAutoName = auto;
  }

  Future<void> _submit(List<ProjectOption> typeOptions, List<ProjectOption> statusOptions) async {
    final name = _nameController.text.trim();
    final clientName = _clientController.text.trim();
    final siteAddress = _addressController.text.trim();
    if (name.isEmpty || clientName.isEmpty || siteAddress.isEmpty || _typeId == null || _statusId == null) {
      return;
    }

    setState(() => _submitting = true);
    try {
      await ref
          .read(apiClientProvider)
          .createProject(
            spaceId: widget.spaceId,
            name: name,
            clientName: clientName,
            siteAddress: siteAddress,
            caseNumber: _caseNumberController.text.trim().isEmpty
                ? null
                : _caseNumberController.text.trim(),
            typeId: _typeId!,
            statusId: _statusId!,
            projectStartDate: _startDate,
          );
      ref.invalidate(spaceProjectsProvider(widget.spaceId));
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() => _submitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final typesAsync = ref.watch(projectTypeOptionsProvider);
    final statusesAsync = ref.watch(projectStatusOptionsProvider);

    return AlertDialog(
      title: const Text('新增專案'),
      content: SizedBox(
        width: 360,
        child: typesAsync.when(
          data: (types) => statusesAsync.when(
            data: (statuses) => _buildForm(types, statuses),
            loading: () => const SizedBox(height: 80, child: Center(child: CircularProgressIndicator())),
            error: (error, _) => Text('讀取狀態選項失敗：$error'),
          ),
          loading: () => const SizedBox(height: 80, child: Center(child: CircularProgressIndicator())),
          error: (error, _) => Text('讀取類型選項失敗：$error'),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: _submitting
              ? null
              : () => _submit(typesAsync.value ?? const [], statusesAsync.value ?? const []),
          child: _submitting
              ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('建立'),
        ),
      ],
    );
  }

  Widget _buildForm(List<ProjectOption> types, List<ProjectOption> statuses) {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _typeId,
                  decoration: const InputDecoration(labelText: '類型 *'),
                  items: [
                    for (final type in types) DropdownMenuItem(value: type.id, child: Text(type.label)),
                  ],
                  onChanged: (value) => setState(() {
                    _typeId = value;
                    _recomputeName(types);
                  }),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _statusId,
                  decoration: const InputDecoration(labelText: '狀態 *'),
                  items: [
                    for (final status in statuses)
                      DropdownMenuItem(value: status.id, child: Text(status.label)),
                  ],
                  onChanged: (value) => setState(() => _statusId = value),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _clientController,
            autofocus: true,
            decoration: const InputDecoration(labelText: '業主名稱 *'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _addressController,
            decoration: const InputDecoration(labelText: '專案地點 *'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _caseNumberController,
            decoration: const InputDecoration(labelText: '案號（選填）'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: '專案名稱', helperText: '預設由業主名稱+專案地點+類型組成，可自行修改'),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text('開工日：${_startDate.year}/${_startDate.month}/${_startDate.day}'),
              ),
              TextButton(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _startDate,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (picked != null) setState(() => _startDate = picked);
                },
                child: const Text('選擇日期'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
