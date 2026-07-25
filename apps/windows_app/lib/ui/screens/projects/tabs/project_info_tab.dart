import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/api_client.dart';
import '../../../../core/models/project.dart';
import '../../../../state/auth_provider.dart';
import '../../../../state/project_editor_provider.dart';
import '../../../../state/project_options_provider.dart';

/// 專案資料 tab: the project's own identity fields — 類型/狀態 (admin-managed
/// dropdowns), 業主名稱/專案地點 (required), 案號 (optional), 開工日. Replaces
/// what used to be four separate "即將推出" placeholder tabs
/// (金額/合約條件/發包狀態/成本控制) with one tab that actually has content.
class ProjectInfoTab extends ConsumerStatefulWidget {
  const ProjectInfoTab({super.key, required this.projectId});

  final String projectId;

  @override
  ConsumerState<ProjectInfoTab> createState() => _ProjectInfoTabState();
}

class _ProjectInfoTabState extends ConsumerState<ProjectInfoTab> {
  late final TextEditingController _clientController;
  late final TextEditingController _addressController;
  late final TextEditingController _caseNumberController;
  final FocusNode _clientFocus = FocusNode();
  final FocusNode _addressFocus = FocusNode();
  final FocusNode _caseNumberFocus = FocusNode();
  Project? _lastKnownProject;

  @override
  void initState() {
    super.initState();
    _clientController = TextEditingController();
    _addressController = TextEditingController();
    _caseNumberController = TextEditingController();
    _clientFocus.addListener(() => _commitOnBlur(_clientFocus, _clientController, (p) => p.clientName, _saveClientName));
    _addressFocus.addListener(() => _commitOnBlur(_addressFocus, _addressController, (p) => p.siteAddress, _saveSiteAddress));
    _caseNumberFocus.addListener(
      () => _commitOnBlur(_caseNumberFocus, _caseNumberController, (p) => p.caseNumber ?? '', _saveCaseNumber),
    );
  }

  @override
  void dispose() {
    _clientController.dispose();
    _addressController.dispose();
    _caseNumberController.dispose();
    _clientFocus.dispose();
    _addressFocus.dispose();
    _caseNumberFocus.dispose();
    super.dispose();
  }

  void _syncControllers(Project project) {
    if (identical(project, _lastKnownProject)) return;
    _lastKnownProject = project;
    if (!_clientFocus.hasFocus) _clientController.text = project.clientName;
    if (!_addressFocus.hasFocus) _addressController.text = project.siteAddress;
    if (!_caseNumberFocus.hasFocus) _caseNumberController.text = project.caseNumber ?? '';
  }

  void _commitOnBlur(
    FocusNode node,
    TextEditingController controller,
    String Function(Project) currentValue,
    void Function(String) save,
  ) {
    if (node.hasFocus) return;
    final project = _lastKnownProject;
    if (project == null) return;
    final text = controller.text.trim();
    if (text != currentValue(project)) save(text);
  }

  Future<void> _run(Future<void> Function() action) async {
    try {
      await action();
      ref.invalidate(projectEditorProvider(widget.projectId));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  void _saveClientName(String value) {
    if (value.isEmpty) return;
    _run(() => ref.read(apiClientProvider).updateProject(projectId: widget.projectId, clientName: value));
  }

  void _saveSiteAddress(String value) {
    if (value.isEmpty) return;
    _run(() => ref.read(apiClientProvider).updateProject(projectId: widget.projectId, siteAddress: value));
  }

  void _saveCaseNumber(String value) {
    _run(
      () => ref
          .read(apiClientProvider)
          .updateProject(
            projectId: widget.projectId,
            caseNumber: value.isEmpty ? null : value,
            clearCaseNumber: value.isEmpty,
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final editorAsync = ref.watch(projectEditorProvider(widget.projectId));
    final typesAsync = ref.watch(projectTypeOptionsProvider);
    final statusesAsync = ref.watch(projectStatusOptionsProvider);

    return editorAsync.when(
      data: (editor) {
        _syncControllers(editor.project);
        return Padding(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: typesAsync.when(
                        data: (types) => DropdownButtonFormField<String>(
                          initialValue: editor.project.type.id,
                          decoration: const InputDecoration(labelText: '類型'),
                          items: [
                            for (final type in types) DropdownMenuItem(value: type.id, child: Text(type.label)),
                          ],
                          onChanged: (value) {
                            if (value == null) return;
                            _run(
                              () => ref
                                  .read(apiClientProvider)
                                  .updateProject(projectId: widget.projectId, typeId: value),
                            );
                          },
                        ),
                        loading: () => const LinearProgressIndicator(),
                        error: (error, _) => Text('讀取失敗：$error'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: statusesAsync.when(
                        data: (statuses) => DropdownButtonFormField<String>(
                          initialValue: editor.project.status.id,
                          decoration: const InputDecoration(labelText: '狀態'),
                          items: [
                            for (final status in statuses)
                              DropdownMenuItem(value: status.id, child: Text(status.label)),
                          ],
                          onChanged: (value) {
                            if (value == null) return;
                            _run(
                              () => ref
                                  .read(apiClientProvider)
                                  .updateProject(projectId: widget.projectId, statusId: value),
                            );
                          },
                        ),
                        loading: () => const LinearProgressIndicator(),
                        error: (error, _) => Text('讀取失敗：$error'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _clientController,
                  focusNode: _clientFocus,
                  decoration: const InputDecoration(labelText: '業主名稱'),
                  onSubmitted: (_) => _clientFocus.unfocus(),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _addressController,
                  focusNode: _addressFocus,
                  decoration: const InputDecoration(labelText: '專案地點'),
                  onSubmitted: (_) => _addressFocus.unfocus(),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _caseNumberController,
                  focusNode: _caseNumberFocus,
                  decoration: const InputDecoration(labelText: '案號（選填）'),
                  onSubmitted: (_) => _caseNumberFocus.unfocus(),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '開工日：${editor.project.projectStartDate.year}/${editor.project.projectStartDate.month}/${editor.project.projectStartDate.day}',
                      ),
                    ),
                    TextButton(
                      onPressed: () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: editor.project.projectStartDate,
                          firstDate: DateTime(2000),
                          lastDate: DateTime(2100),
                        );
                        if (picked == null) return;
                        await _run(
                          () => ref
                              .read(apiClientProvider)
                              .updateProject(projectId: widget.projectId, projectStartDate: picked),
                        );
                      },
                      child: const Text('修改日期'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(child: Text('讀取專案失敗：$error')),
    );
  }
}
